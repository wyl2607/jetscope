import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const adminToken = 'smoke-admin-token';
const apiPython = existsSync(join(rootDir, 'apps/api/.venv/bin/python'))
  ? join(rootDir, 'apps/api/.venv/bin/python')
  : 'python3';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    if (logs.length > 120) {
      logs.shift();
    }
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

function randomPort(min = 20000, max = 50000) {
  const span = max - min;
  return min + Math.floor(Math.random() * span);
}

async function stopProcess(proc) {
  if (!proc || proc.child.exitCode !== null || proc.child.signalCode !== null) {
    return;
  }
  proc.child.kill('SIGTERM');
  const deadline = Date.now() + 2500;
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

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { status: response.status, text };
}

async function run() {
  const apiPort = randomPort();
  const webPort = randomPort(50001, 65000);
  const tempDir = mkdtempSync(join(tmpdir(), 'safvsoil-smoke-'));
  const sqlitePath = join(tempDir, 'smoke.db');

  let apiProc = null;
  let webProc = null;

  try {
    apiProc = startProcess(
      'api',
      apiPython,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)],
      {
        cwd: join(rootDir, 'apps/api'),
        env: {
          ...process.env,
          SAFVSOIL_DATABASE_URL: `sqlite+pysqlite:///${sqlitePath}`,
          SAFVSOIL_SCHEMA_BOOTSTRAP_MODE: 'alembic',
          SAFVSOIL_MARKET_REFRESH_INTERVAL_SECONDS: '0',
          SAFVSOIL_ADMIN_TOKEN: adminToken,
          SAFVSOIL_API_PREFIX: '/v1'
        }
      }
    );

    await waitForUrl(`http://127.0.0.1:${apiPort}/v1/health`);

    webProc = startProcess(
      'web',
      'npm',
      ['--prefix', 'apps/web', 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(webPort)],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          SAFVSOIL_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
          SAFVSOIL_API_PREFIX: '/v1',
          SAFVSOIL_WORKSPACE_SLUG: 'default'
        }
      }
    );
    console.log(`Smoke env: apiPort=${apiPort} webPort=${webPort} sqlite=${sqlitePath}`);

    await waitForUrl(`http://127.0.0.1:${webPort}/api/pathways`);

    const webBase = `http://127.0.0.1:${webPort}`;

    const getPathways = await fetchJson(`${webBase}/api/pathways`);
    assert(getPathways.status === 200, `GET /api/pathways expected 200, got ${getPathways.status}`);
    assert(Array.isArray(getPathways.json), 'GET /api/pathways should return an array');

    const putPathwaysNoToken = await fetchJson(`${webBase}/api/pathways`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([])
    });
    assert(
      putPathwaysNoToken.status === 401,
      `PUT /api/pathways without token expected 401, got ${putPathwaysNoToken.status}`
    );

    const pathwayPayload = [
      {
        pathway_id: 'smoke-pathway',
        name: 'Smoke Pathway',
        pathway: 'Smoke -> Validation',
        base_cost_usd_per_l: 2.11,
        co2_savings_kg_per_l: 1.77,
        category: 'saf'
      }
    ];
    const putPathwaysOk = await fetchJson(`${webBase}/api/pathways`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify(pathwayPayload)
    });
    assert(putPathwaysOk.status === 200, `PUT /api/pathways expected 200, got ${putPathwaysOk.status}`);

    const getPolicies = await fetchJson(`${webBase}/api/policies/refuel-eu`);
    assert(getPolicies.status === 200, `GET /api/policies/refuel-eu expected 200, got ${getPolicies.status}`);
    assert(Array.isArray(getPolicies.json), 'GET /api/policies/refuel-eu should return an array');

    const putPoliciesNoToken = await fetchJson(`${webBase}/api/policies/refuel-eu`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([])
    });
    assert(
      putPoliciesNoToken.status === 401,
      `PUT /api/policies/refuel-eu without token expected 401, got ${putPoliciesNoToken.status}`
    );

    const policyPayload = [
      {
        year: 2042,
        saf_share_pct: 42,
        synthetic_share_pct: 17.5,
        label: 'Smoke target'
      }
    ];
    const putPoliciesOk = await fetchJson(`${webBase}/api/policies/refuel-eu`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify(policyPayload)
    });
    assert(
      putPoliciesOk.status === 200,
      `PUT /api/policies/refuel-eu expected 200, got ${putPoliciesOk.status}`
    );

    const scenarioPayload = {
      name: 'Smoke Scenario',
      preferences: {
        schema_version: 1,
        crudeSource: 'manual',
        carbonSource: 'manual',
        benchmarkMode: 'crude-proxy',
        carbonPriceUsdPerTonne: 120
      },
      route_edits: {
        'smoke-pathway': {
          baseCostUsdPerLiter: 2.05,
          co2SavingsKgPerLiter: 1.7
        }
      }
    };

    const createScenarioNoToken = await fetchJson(`${webBase}/api/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scenarioPayload)
    });
    assert(
      createScenarioNoToken.status === 401,
      `POST /api/scenarios without token expected 401, got ${createScenarioNoToken.status}`
    );

    const createScenarioOk = await fetchJson(`${webBase}/api/scenarios`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify(scenarioPayload)
    });
    assert(createScenarioOk.status === 200, `POST /api/scenarios expected 200, got ${createScenarioOk.status}`);
    const createdScenarioId = createScenarioOk.json?.id;
    assert(typeof createdScenarioId === 'string' && createdScenarioId.length > 0, 'Scenario id missing');

    const scenariosPage = await fetchText(`${webBase}/scenarios`);
    assert(scenariosPage.status === 200, `GET /scenarios expected 200, got ${scenariosPage.status}`);
    assert(
      scenariosPage.text.includes('Live scenario registry'),
      'Scenarios page should render registry container'
    );
    assert(scenariosPage.text.includes('Scenario editor'), 'Scenarios page should render editor container');

    const adminPage = await fetchText(`${webBase}/admin`);
    assert(adminPage.status === 200, `GET /admin expected 200, got ${adminPage.status}`);
    assert(adminPage.text.includes('Pathways admin'), 'Admin page should render pathways card');
    assert(adminPage.text.includes('Policies admin'), 'Admin page should render policies card');

    const dashboardPage = await fetchText(`${webBase}/dashboard`);
    assert(dashboardPage.status === 200, `GET /dashboard expected 200, got ${dashboardPage.status}`);
    assert(
      dashboardPage.text.includes('Smoke Scenario'),
      'Dashboard should include recently created scenario in SSR payload'
    );

    const sourcesPage = await fetchText(`${webBase}/sources`);
    assert(sourcesPage.status === 200, `GET /sources expected 200, got ${sourcesPage.status}`);
    assert(sourcesPage.text.includes('Live source matrix'), 'Sources page should render source matrix card');
    assert(sourcesPage.text.includes('Brent'), 'Sources page should render Brent row');

    const updateScenarioOk = await fetchJson(`${webBase}/api/scenarios/${createdScenarioId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({
        ...scenarioPayload,
        name: 'Smoke Scenario Updated'
      })
    });
    assert(updateScenarioOk.status === 200, `PUT /api/scenarios/:id expected 200, got ${updateScenarioOk.status}`);

    const deleteScenarioOk = await fetchJson(`${webBase}/api/scenarios/${createdScenarioId}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': adminToken }
    });
    assert(
      deleteScenarioOk.status === 200,
      `DELETE /api/scenarios/:id expected 200, got ${deleteScenarioOk.status}`
    );

    const dashboardAfterDelete = await fetchText(`${webBase}/dashboard`);
    assert(
      dashboardAfterDelete.status === 200,
      `GET /dashboard after delete expected 200, got ${dashboardAfterDelete.status}`
    );
    assert(
      !dashboardAfterDelete.text.includes('Smoke Scenario Updated'),
      'Deleted scenario should not remain in dashboard recent scenario list'
    );

    const marketRefreshNoToken = await fetchJson(`${webBase}/api/market/refresh`, {
      method: 'POST'
    });
    assert(
      marketRefreshNoToken.status === 401,
      `POST /api/market/refresh without token expected 401, got ${marketRefreshNoToken.status}`
    );

    console.log('Product smoke preflight passed.');
  } finally {
    await stopProcess(webProc);
    await stopProcess(apiProc);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
