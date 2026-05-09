import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helpersDir, '../..');

async function writeTempModule(relativePath, source) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-web-lib-'));
  const tempPath = path.join(tempDir, path.basename(relativePath));

  await writeFile(tempPath, source, 'utf8');

  return pathToFileURL(tempPath).href;
}

async function reserveTempPath(relativePath) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-web-lib-'));
  const tempPath = path.join(tempDir, path.basename(relativePath));
  return { tempPath, url: pathToFileURL(tempPath).href };
}

function rewriteAppAliasImports(source, options = {}) {
  const apiConfigUrl = pathToFileURL(path.join(repoRoot, 'apps/web/lib/api-config.ts')).href;
  const productReadModelUrl =
    options.productReadModelUrl ?? pathToFileURL(path.join(repoRoot, 'apps/web/lib/product-read-model.ts')).href;
  const dashboardReadModelUrl =
    options.dashboardReadModelUrl ?? pathToFileURL(path.join(repoRoot, 'apps/web/lib/dashboard-read-model.ts')).href;
  const priceTrendChartReadModelUrl =
    options.priceTrendChartReadModelUrl ??
    pathToFileURL(path.join(repoRoot, 'apps/web/lib/price-trend-chart-read-model.ts')).href;
  const researchSignalsReadModelUrl =
    options.researchSignalsReadModelUrl ??
    pathToFileURL(path.join(repoRoot, 'apps/web/lib/research-signals-read-model.ts')).href;
  return source
    .replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`)
    .replaceAll("'@/lib/product-read-model'", `'${productReadModelUrl}'`)
    .replaceAll("'@/lib/dashboard-read-model'", `'${dashboardReadModelUrl}'`)
    .replaceAll("'@/lib/price-trend-chart-read-model'", `'${priceTrendChartReadModelUrl}'`)
    .replaceAll("'@/lib/research-signals-read-model'", `'${researchSignalsReadModelUrl}'`)
    .replaceAll("'./dashboard-read-model'", `'${dashboardReadModelUrl}'`)
    .replaceAll("'./price-trend-chart-read-model'", `'${priceTrendChartReadModelUrl}'`)
    .replaceAll("'./research-signals-read-model'", `'${researchSignalsReadModelUrl}'`)
    .replaceAll("'./product-read-model'", `'${productReadModelUrl}'`);
}

export async function importWebLib(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const rawSource = await readFile(sourcePath, 'utf8');

  // Pre-allocate temp file paths so circular re-exports between
  // product-read-model and the extracted sibling modules can be rewritten consistently.
  const productReadModelPath = 'apps/web/lib/product-read-model.ts';
  const dashboardReadModelPath = 'apps/web/lib/dashboard-read-model.ts';
  const priceTrendChartReadModelPath = 'apps/web/lib/price-trend-chart-read-model.ts';
  const researchSignalsReadModelPath = 'apps/web/lib/research-signals-read-model.ts';
  const productReadModelSlot = await reserveTempPath(productReadModelPath);
  const dashboardReadModelSlot = await reserveTempPath(dashboardReadModelPath);
  const priceTrendChartReadModelSlot = await reserveTempPath(priceTrendChartReadModelPath);
  const researchSignalsReadModelSlot = await reserveTempPath(researchSignalsReadModelPath);

  const rewriteOptions = {
    productReadModelUrl: productReadModelSlot.url,
    dashboardReadModelUrl: dashboardReadModelSlot.url,
    priceTrendChartReadModelUrl: priceTrendChartReadModelSlot.url,
    researchSignalsReadModelUrl: researchSignalsReadModelSlot.url
  };

  const productReadModelSource = rewriteAppAliasImports(
    await readFile(path.join(repoRoot, productReadModelPath), 'utf8'),
    rewriteOptions
  );
  await writeFile(productReadModelSlot.tempPath, productReadModelSource, 'utf8');

  const dashboardReadModelSource = rewriteAppAliasImports(
    await readFile(path.join(repoRoot, dashboardReadModelPath), 'utf8'),
    rewriteOptions
  );
  await writeFile(dashboardReadModelSlot.tempPath, dashboardReadModelSource, 'utf8');

  const priceTrendChartReadModelSource = rewriteAppAliasImports(
    await readFile(path.join(repoRoot, priceTrendChartReadModelPath), 'utf8'),
    rewriteOptions
  );
  await writeFile(priceTrendChartReadModelSlot.tempPath, priceTrendChartReadModelSource, 'utf8');

  const researchSignalsReadModelSource = rewriteAppAliasImports(
    await readFile(path.join(repoRoot, researchSignalsReadModelPath), 'utf8'),
    rewriteOptions
  );
  await writeFile(researchSignalsReadModelSlot.tempPath, researchSignalsReadModelSource, 'utf8');

  const source = rewriteAppAliasImports(rawSource, rewriteOptions);
  const tempUrl = await writeTempModule(relativePath, source);

  return import(`${tempUrl}?ts=${Date.now()}-${Math.random()}`);
}
