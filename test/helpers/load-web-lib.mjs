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

function rewriteAppAliasImports(source, options = {}) {
  const apiConfigUrl = pathToFileURL(path.join(repoRoot, 'apps/web/lib/api-config.ts')).href;
  const productReadModelUrl =
    options.productReadModelUrl ?? pathToFileURL(path.join(repoRoot, 'apps/web/lib/product-read-model.ts')).href;
  return source
    .replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`)
    .replaceAll("'@/lib/product-read-model'", `'${productReadModelUrl}'`);
}

export async function importWebLib(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const rawSource = await readFile(sourcePath, 'utf8');
  let productReadModelUrl;

  if (rawSource.includes("'@/lib/product-read-model'")) {
    const productReadModelPath = 'apps/web/lib/product-read-model.ts';
    const productReadModelSource = rewriteAppAliasImports(
      await readFile(path.join(repoRoot, productReadModelPath), 'utf8')
    );
    productReadModelUrl = await writeTempModule(productReadModelPath, productReadModelSource);
  }

  const source = rewriteAppAliasImports(rawSource, { productReadModelUrl });
  const tempUrl = await writeTempModule(relativePath, source);

  return import(`${tempUrl}?ts=${Date.now()}-${Math.random()}`);
}
