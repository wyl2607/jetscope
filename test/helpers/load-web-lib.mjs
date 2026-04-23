import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helpersDir, '../..');

function rewriteAppAliasImports(source) {
  const apiConfigUrl = pathToFileURL(path.join(repoRoot, 'apps/web/lib/api-config.ts')).href;
  return source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
}

export async function importWebLib(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const source = rewriteAppAliasImports(await readFile(sourcePath, 'utf8'));
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-web-lib-'));
  const tempPath = path.join(tempDir, path.basename(relativePath));

  await writeFile(tempPath, source, 'utf8');

  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}
