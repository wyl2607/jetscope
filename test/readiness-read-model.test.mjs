import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function installFetchStub(t, handlers) {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    const handler = handlers.get(url);
    if (!handler) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return handler();
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
}

function installEnv(t) {
  const previousBase = process.env.JETSCOPE_API_BASE_URL;
  const previousPrefix = process.env.JETSCOPE_API_PREFIX;
  process.env.JETSCOPE_API_BASE_URL = 'https://api.example.com';
  process.env.JETSCOPE_API_PREFIX = '/v1';
  t.after(() => {
    if (previousBase === undefined) {
      delete process.env.JETSCOPE_API_BASE_URL;
    } else {
      process.env.JETSCOPE_API_BASE_URL = previousBase;
    }
    if (previousPrefix === undefined) {
      delete process.env.JETSCOPE_API_PREFIX;
    } else {
      process.env.JETSCOPE_API_PREFIX = previousPrefix;
    }
  });
}

async function importReadinessReadModel() {
  const source = await readFile(new URL('../apps/web/lib/readiness-read-model.ts', import.meta.url), 'utf8');
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source.replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-readiness-read-model-'));
  const tempPath = path.join(tempDir, 'readiness-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

test('getLaunchReadinessReadModel maps launch checks to operator actions', async (t) => {
  installEnv(t);
  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/readiness',
        () =>
          jsonResponse({
            ready: false,
            status: 'not_ready',
            generated_at: '2026-06-03T12:00:00Z',
            environment: 'development',
            api_prefix: '/v1',
            schema_bootstrap_mode: 'alembic',
            degraded: true,
            checks: {
              database: { ok: true, status: 'ok' },
              source_coverage: { ok: true, status: 'degraded', detail: 'completeness=0.714; metrics=7' },
              admin_token: { ok: false, status: 'missing', detail: 'JETSCOPE_ADMIN_TOKEN is not configured' },
              ai_research_pipeline: { ok: false, status: 'disabled', detail: 'JETSCOPE_AI_RESEARCH_ENABLED is false' }
            }
          })
      ]
    ])
  );

  const { getLaunchReadinessReadModel } = await importReadinessReadModel();
  const readModel = await getLaunchReadinessReadModel();

  assert.equal(readModel.ready, false);
  assert.equal(readModel.statusLabel, '未就绪');
  assert.equal(readModel.degraded, true);
  assert.equal(readModel.checks[0].key, 'database');
  assert.equal(readModel.checks[1].key, 'source_coverage');
  assert.equal(readModel.checks[1].tone, 'review');
  assert.equal(readModel.checks[1].actionHref, '/sources?filter=review');
  const admin = readModel.checks.find((check) => check.key === 'admin_token');
  assert.equal(admin?.statusLabel, '缺少配置');
  assert.equal(admin?.tone, 'critical');
  assert.equal(admin?.actionHref, '/admin');
  const research = readModel.checks.find((check) => check.key === 'ai_research_pipeline');
  assert.equal(research?.statusLabel, '未启用');
  assert.equal(research?.actionHref, '/research');
});

test('getLaunchReadinessReadModel returns a not-ready fallback when API fails', async (t) => {
  installEnv(t);
  installFetchStub(
    t,
    new Map([
      ['https://api.example.com/v1/readiness', () => jsonResponse({ error: 'offline' }, 503)]
    ])
  );

  const { getLaunchReadinessReadModel } = await importReadinessReadModel();
  const readModel = await getLaunchReadinessReadModel();

  assert.equal(readModel.ready, false);
  assert.equal(readModel.status, 'not_ready');
  assert.match(readModel.error ?? '', /readiness HTTP 503/);
  assert.deepEqual(readModel.checks, []);
});
