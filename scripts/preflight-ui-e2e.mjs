import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const adminToken = 'smoke-admin-token';
const maxAttempts = 2;
const apiPython = process.env.JETSCOPE_PYTHON_BIN
  ?? process.env.PYTHON_BIN
  ?? (existsSync(join(rootDir, 'apps/api/.venv/Scripts/python.exe'))
    ? join(rootDir, 'apps/api/.venv/Scripts/python.exe')
    : existsSync(join(rootDir, 'apps/api/.venv/bin/python'))
      ? join(rootDir, 'apps/api/.venv/bin/python')
      : process.platform === 'win32'
        ? 'python'
        : 'python3');

function randomPort(min = 20000, max = 50000) {
  const span = max - min;
  return min + Math.floor(Math.random() * span);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function createArtifactsDir(attempt) {
  const dir = join(rootDir, 'test-results', 'ui-e2e-artifacts', `${timestamp()}-attempt-${attempt}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeLogsFile(filePath, lines = []) {
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : 'no logs captured\n';
  writeFileSync(filePath, content, 'utf8');
}

async function waitForErrorText(page, pattern, timeout = 10_000) {
  await page.locator('p').filter({ hasText: pattern }).first().waitFor({ timeout });
}

function startProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logs = [];
  const pushLog = (line) => {
    logs.push(line);
    if (logs.length > 400) logs.shift();
  };

  child.stdout?.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      const tagged = `[${name}] ${line}`;
      pushLog(tagged);
      console.log(tagged);
    }
  });

  child.stderr?.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      const tagged = `[${name}] ${line}`;
      pushLog(tagged);
      console.error(tagged);
    }
  });

  child.on('exit', (code, signal) => {
    if (code !== null) {
      console.log(`[${name}] exited with code ${code}`);
    } else {
      console.log(`[${name}] exited due to signal ${signal ?? 'unknown'}`);
    }
  });

  return { name, child, logs };
}

async function stopProcess(proc) {
  if (!proc || proc.child.exitCode !== null || proc.child.signalCode !== null) {
    return;
  }
  proc.child.kill('SIGTERM');
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
      return;
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  proc.child.kill('SIGKILL');
}

async function waitForUrl(url, { expectedStatus = 200, timeoutMs = 90000 } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.status === expectedStatus) {
        return;
      }
      lastError = new Error(`Received status ${response.status} from ${url}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError?.message ?? 'unknown'}`);
}

async function captureFailureArtifacts({
  attempt,
  error,
  page,
  apiProc,
  webProc,
  apiPort,
  webPort,
  sqlitePath
}) {
  const artifactsDir = createArtifactsDir(attempt);
  writeFileSync(
    join(artifactsDir, 'error.txt'),
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    'utf8'
  );
  writeFileSync(
    join(artifactsDir, 'context.json'),
    JSON.stringify(
      {
        attempt,
        apiPort,
        webPort,
        sqlitePath,
        capturedAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  );
  writeLogsFile(join(artifactsDir, 'api.log'), apiProc?.logs ?? []);
  writeLogsFile(join(artifactsDir, 'web.log'), webProc?.logs ?? []);

  if (page) {
    try {
      await page.screenshot({
        path: join(artifactsDir, 'page.png'),
        fullPage: true
      });
    } catch {
      // best effort
    }
    try {
      writeFileSync(join(artifactsDir, 'page.html'), await page.content(), 'utf8');
    } catch {
      // best effort
    }
  }
  console.error(`Failure artifacts captured at ${artifactsDir}`);
}

async function runUiFlow(page) {
  const scenarioName = `UI E2E ${Date.now()}`;
  const updatedScenarioName = `${scenarioName} Updated`;
  const invalidToken = 'invalid-token';

  const createButton = page.getByRole('button', { name: 'Create' });

  const initialScenariosLoad = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'GET' &&
      resp.url().includes('/api/scenarios') &&
      resp.status() === 200
  );
  await page.goto('/scenarios');
  await initialScenariosLoad;

  await page.getByPlaceholder('Scenario name').fill(`${scenarioName} Missing Token`);
  assert(await createButton.isDisabled(), 'Create must be disabled when admin token is missing');

  await page.getByPlaceholder('x-admin-token').fill(invalidToken);
  await page.getByPlaceholder('Scenario name').fill(`${scenarioName} Invalid Token`);
  const invalidCreateRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && resp.url().includes('/api/scenarios'),
    { timeout: 10_000 }
  );
  await createButton.click();
  const invalidCreateResp = await invalidCreateRespPromise;
  assert(
    invalidCreateResp.status() === 401 || invalidCreateResp.status() === 403,
    `Invalid-token create should fail with 401/403, got ${invalidCreateResp.status()}`
  );
  await waitForErrorText(page, /401|token|forbidden|unauthorized/i);

  await page.getByPlaceholder('x-admin-token').fill(adminToken);
  await page.getByPlaceholder('Scenario name').fill(`${scenarioName} Invalid Route`);
  await page.getByLabel('Route edits JSON (advanced)').fill(
    '{"sugar-atj":{"baseCostUsdPerLiter":"oops"}}'
  );
  await createButton.click();
  await waitForErrorText(page, /finite number/i);

  await page.getByPlaceholder('Scenario name').fill(`${scenarioName} Invalid Preferences`);
  await page.getByLabel('Preferences JSON (advanced)').fill('{"crudeSource":"invalid-source"}');
  await page.getByLabel('Route edits JSON (advanced)').fill(
    '{"sugar-atj":{"pathway":"Sugar -> Ethanol -> Jet","baseCostUsdPerLiter":1.95,"co2SavingsKgPerLiter":1.45}}'
  );
  await createButton.click();
  await waitForErrorText(page, /unsupported value/i);

  await page.getByLabel('Preferences JSON (advanced)').fill('{}');
  await page.getByLabel('Route edits JSON (advanced)').fill(
    '{"sugar-atj":{"pathway":"Sugar -> Ethanol -> Jet","baseCostUsdPerLiter":1.95,"co2SavingsKgPerLiter":1.45}}'
  );
  await page.getByPlaceholder('Scenario name').fill(scenarioName);
  const createRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && resp.url().includes('/api/scenarios'),
    { timeout: 10_000 }
  );
  await createButton.click();
  const createResp = await createRespPromise;
  if (!createResp.ok()) {
    throw new Error(`Create scenario failed: ${createResp.status()} ${await createResp.text()}`);
  }

  await page.waitForSelector(`button:has-text("${scenarioName}")`);
  await page.getByRole('button', { name: scenarioName }).click();
  await page.getByPlaceholder('Scenario name').fill(updatedScenarioName);
  await page.getByLabel('Route edits JSON (advanced)').fill(
    '{"sugar-atj":{"pathway":"Sugar -> Ethanol -> Jet","baseCostUsdPerLiter":1.95,"co2SavingsKgPerLiter":1.45}}'
  );
  const updateButton = page.getByRole('button', { name: 'Update selected' });
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const update = buttons.find((button) => button.textContent?.trim() === 'Update selected');
      return !!update && !update.disabled;
    },
    undefined,
    { timeout: 10_000 }
  );
  const updateRespPromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'PUT' &&
      resp.url().includes('/api/scenarios/') &&
      !resp.url().includes('/api/scenarios?'),
    { timeout: 10_000 }
  );
  await updateButton.click();
  const updateResp = await updateRespPromise;
  if (!updateResp.ok()) {
    throw new Error(`Update scenario failed: ${updateResp.status()} ${await updateResp.text()}`);
  }
  await page.waitForSelector(`button:has-text("${updatedScenarioName}")`);

  await page.goto('/dashboard');
  const dashboardHasUpdated = await page.getByText(updatedScenarioName).count();
  assert(dashboardHasUpdated > 0, 'Dashboard should render updated scenario name');

  await page.goto('/admin');
  const adminTokenInput = page.getByPlaceholder('x-admin-token');
  const savePathwaysButton = page.getByRole('button', { name: 'Save pathways' });
  const savePoliciesButton = page.getByRole('button', { name: 'Save policies' });
  const triggerMarketRefreshButton = page.getByRole('button', { name: 'Trigger market refresh' });
  const reloadButton = page.getByRole('button', { name: 'Reload' });
  const pathwaysTextArea = page.locator('textarea').first();
  const policiesTextArea = page.locator('textarea').nth(1);

  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const reload = buttons.find((button) => button.textContent?.trim() === 'Reload');
      return !!reload && !reload.disabled;
    },
    undefined,
    { timeout: 10_000 }
  );

  await adminTokenInput.fill('');
  assert(await savePathwaysButton.isDisabled(), 'Save pathways must be disabled when token is missing');
  assert(await savePoliciesButton.isDisabled(), 'Save policies must be disabled when token is missing');
  assert(
    await triggerMarketRefreshButton.isDisabled(),
    'Trigger market refresh must be disabled when token is missing'
  );

  await adminTokenInput.fill(invalidToken);
  const invalidPathwaysRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && resp.url().includes('/api/pathways'),
    { timeout: 10_000 }
  );
  await savePathwaysButton.click();
  const invalidPathwaysResp = await invalidPathwaysRespPromise;
  assert(
    invalidPathwaysResp.status() === 401 || invalidPathwaysResp.status() === 403,
    `Invalid-token pathways save should fail with 401/403, got ${invalidPathwaysResp.status()}`
  );
  await waitForErrorText(page, /401|token|forbidden|unauthorized/i);

  const invalidRefreshRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && resp.url().includes('/api/market/refresh'),
    { timeout: 10_000 }
  );
  await triggerMarketRefreshButton.click();
  const invalidRefreshResp = await invalidRefreshRespPromise;
  assert(
    invalidRefreshResp.status() === 401 || invalidRefreshResp.status() === 403,
    `Invalid-token market refresh should fail with 401/403, got ${invalidRefreshResp.status()}`
  );
  await waitForErrorText(page, /401|token|forbidden|unauthorized/i);

  await adminTokenInput.fill(adminToken);
  const validRefreshRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && resp.url().includes('/api/market/refresh'),
    { timeout: 20_000 }
  );
  await triggerMarketRefreshButton.click();
  const validRefreshResp = await validRefreshRespPromise;
  assert(
    validRefreshResp.status() !== 401 && validRefreshResp.status() !== 403,
    `Market refresh with valid token must not fail auth, got ${validRefreshResp.status()}`
  );

  await pathwaysTextArea.fill('{');
  await savePathwaysButton.click();
  await waitForErrorText(page, /must be valid JSON/i);

  await policiesTextArea.fill('{');
  await savePoliciesButton.click();
  await waitForErrorText(page, /policies must be valid JSON|must be valid JSON/i);

  await reloadButton.click();
  await page.locator('p').filter({ hasText: 'Loaded pathways + policies' }).first().waitFor({
    timeout: 10_000
  });

  const pathwaySaveRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && resp.url().includes('/api/pathways'),
    { timeout: 10_000 }
  );
  await savePathwaysButton.click();
  const pathwaySaveResp = await pathwaySaveRespPromise;
  if (!pathwaySaveResp.ok()) {
    throw new Error(`Save pathways failed: ${pathwaySaveResp.status()} ${await pathwaySaveResp.text()}`);
  }

  const policySaveRespPromise = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && resp.url().includes('/api/policies/refuel-eu'),
    { timeout: 10_000 }
  );
  await savePoliciesButton.click();
  const policySaveResp = await policySaveRespPromise;
  if (!policySaveResp.ok()) {
    throw new Error(`Save policies failed: ${policySaveResp.status()} ${await policySaveResp.text()}`);
  }

  await page.goto('/scenarios');
  await page.getByPlaceholder('x-admin-token').fill(adminToken);
  await page.getByRole('button', { name: updatedScenarioName }).click();
  const deleteRespPromise = page.waitForResponse(
    (resp) =>
      resp.request().method() === 'DELETE' &&
      resp.url().includes('/api/scenarios/') &&
      !resp.url().includes('/api/scenarios?'),
    { timeout: 10_000 }
  );
  await page.getByRole('button', { name: 'Delete selected' }).click();
  const deleteResp = await deleteRespPromise;
  if (!deleteResp.ok()) {
    throw new Error(`Delete scenario failed: ${deleteResp.status()} ${await deleteResp.text()}`);
  }
  await page.waitForFunction((name) => !document.body.innerText.includes(name), updatedScenarioName);

  await page.goto('/dashboard');
  const dashboardHasDeleted = await page.getByText(updatedScenarioName).count();
  assert(dashboardHasDeleted === 0, 'Dashboard should not keep deleted scenario');
}

async function runAttempt(attempt) {
  const apiPort = randomPort();
  const webPort = randomPort(50001, 65000);
  const tempDir = mkdtempSync(join(tmpdir(), 'jetscope-ui-e2e-'));
  const sqlitePath = join(tempDir, 'ui-e2e.db');

  let apiProc = null;
  let webProc = null;
  let browser = null;
  let page = null;

  console.log(`UI E2E env: apiPort=${apiPort} webPort=${webPort} sqlite=${sqlitePath}`);

  try {
    apiProc = startProcess(
      'api',
      apiPython,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)],
      {
        cwd: join(rootDir, 'apps/api'),
        env: {
          ...process.env,
          JETSCOPE_DATABASE_URL: `sqlite+pysqlite:///${sqlitePath}`,
          JETSCOPE_SCHEMA_BOOTSTRAP_MODE: 'alembic',
          JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS: '0',
          JETSCOPE_ADMIN_TOKEN: adminToken,
          JETSCOPE_API_PREFIX: '/v1'
        }
      }
    );

    await waitForUrl(`http://127.0.0.1:${apiPort}/v1/health`);

    webProc = startProcess(
      'web',
      'npm',
      ['--prefix', 'apps/web', 'run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(webPort)],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          JETSCOPE_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
          JETSCOPE_API_PREFIX: '/v1',
          JETSCOPE_WORKSPACE_SLUG: 'default',
          SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS: '1500'
        }
      }
    );

    await waitForUrl(`http://127.0.0.1:${webPort}/scenarios`);

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ baseURL: `http://127.0.0.1:${webPort}` });
    await runUiFlow(page);
  } catch (error) {
    await captureFailureArtifacts({
      attempt,
      error,
      page,
      apiProc,
      webProc,
      apiPort,
      webPort,
      sqlitePath
    }).catch(() => {});
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await stopProcess(webProc);
    await stopProcess(apiProc);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function run() {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`Starting UI E2E attempt ${attempt}/${maxAttempts}`);
      await runAttempt(attempt);
      console.log('UI E2E preflight passed.');
      return;
    } catch (error) {
      lastError = error;
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`UI E2E attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        console.error('Retrying UI E2E once due to failure...');
        await sleep(1500);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
