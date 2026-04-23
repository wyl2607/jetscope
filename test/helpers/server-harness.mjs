import path from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

export async function startMockedServer({ localPreferencesFile } = {}) {
  const preferencesFile =
    localPreferencesFile ??
    path.join(
      tmpdir(),
      `safvsoil-local-preferences-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
  const child = spawn(process.execPath, ['--import', './test/helpers/mock-market-fetch.mjs', './server.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      PORT: '0',
      SAFVSOIL_LOCAL_PREFERENCES_FILE: preferencesFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for server start. stdout=${stdout} stderr=${stderr}`)), 8000);

    child.stdout.on('data', (chunk) => {
      const match = chunk.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before start (code=${code}, signal=${signal}). stdout=${stdout} stderr=${stderr}`));
    });
  });

  return {
    port,
    localPreferencesFile: preferencesFile,
    async fetchJson(pathname, init = {}) {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, init);
      return {
        status: response.status,
        body: await response.json()
      };
    },
    async close() {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  };
}
