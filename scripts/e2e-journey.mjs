import { runIsolatedUiE2e } from './preflight-ui-e2e.mjs';

const ADMIN_TOKEN = 'smoke-admin-token';
const BLOCKED_PROXY = 'http://127.0.0.1:9';
const forbiddenSeedValues = ['0.64', '0.640', '80.38', '87.01', '1.1435', '0.657'];

function excerpt(text, maxLength = 2400) {
  return text.replaceAll(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function pageText(page) {
  return page.locator('body').innerText();
}

async function expectPage(page, condition, assertion) {
  if (condition) return;
  throw new Error(`${assertion}\nPage text excerpt:\n${excerpt(await pageText(page))}`);
}

async function forceOfflineRefresh({ apiPort }) {
  const response = await fetch(`http://127.0.0.1:${apiPort}/v1/market/refresh`, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`Offline market refresh failed: HTTP ${response.status} ${payload}`);
  }
  if (!payload.includes('status=error')) {
    throw new Error(`Offline market refresh must report status=error, got: ${payload}`);
  }
}

async function runJourney(page) {
  await page.goto('/');
  await expectPage(page, (await page.title()).includes('JetScope'), 'Home page title must contain JetScope');
  await expectPage(page, !(await pageText(page)).includes('连续六周'), 'Home page must not claim “连续六周”');

  await page.goto('/dashboard');
  const dashboardText = await pageText(page);
  await expectPage(page, dashboardText.includes('数据缺失'), 'Dashboard must show 数据缺失 when all market sources are offline');
  for (const value of forbiddenSeedValues) {
    await expectPage(page, !dashboardText.includes(value), `Dashboard must not display seed value ${value}`);
  }

  await page.goto('/crisis/saf-tipping-point?fuel=2.0');
  const fuelInput = page.getByLabel(/化石航油 USD\/L/);
  await expectPage(page, (await fuelInput.inputValue()) === '2', 'Fuel query parameter must populate the input as 2.0');
  const workbenchText = await pageText(page);
  await expectPage(page, /你的输入|假设值/.test(workbenchText), 'Fuel input must be labelled as user input or an assumption');
  await expectPage(page, !/观测时间|观察时间/.test(workbenchText), 'Assumed fuel input must not show an observation timestamp');
  await expectPage(page, await page.getByRole('button', { name: '复制分享链接' }).count() === 1, 'Workbench must expose the share-link button');

  await page.goto('/sources');
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  await expectPage(page, rowCount > 0, 'Sources page must show metric-status rows');
  let missingRows = 0;
  for (let index = 0; index < rowCount; index += 1) {
    const cells = rows.nth(index).locator('td');
    if ((await cells.count()) < 10) continue;
    if ((await cells.nth(7).innerText()).trim() !== 'missing') continue;
    missingRows += 1;
    await expectPage(
      page,
      (await cells.nth(9).innerText()).trim() === '—',
      `Missing source row ${index + 1} must show no numeric value`
    );
  }
  await expectPage(page, missingRows > 0, 'Sources page must expose at least one missing metric');

  await page.goto('/analysis/lufthansa-flight-cuts-2026-04');
  await expectPage(page, await page.getByText('来源', { exact: false }).count() > 0, 'Lufthansa analysis must contain a sources section');
  await expectPage(
    page,
    await page.locator('a[href^="/crisis/saf-tipping-point"]').count() > 0,
    'Lufthansa analysis must link to the tipping-point workbench'
  );
}

runIsolatedUiE2e({
  label: 'MVP journey E2E',
  flow: runJourney,
  beforeWebStart: forceOfflineRefresh,
  apiEnv: {
    // No business-code switch exists for offline sources. Route all HTTP clients to
    // an unbound loopback port, keeping the offline condition deterministic and local.
    HTTP_PROXY: BLOCKED_PROXY,
    HTTPS_PROXY: BLOCKED_PROXY,
    ALL_PROXY: BLOCKED_PROXY,
    http_proxy: BLOCKED_PROXY,
    https_proxy: BLOCKED_PROXY,
    all_proxy: BLOCKED_PROXY,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost'
  }
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
