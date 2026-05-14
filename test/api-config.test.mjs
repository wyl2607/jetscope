import assert from 'node:assert/strict';
import test from 'node:test';

async function importApiConfig(env = {}) {
  const previous = {
    JETSCOPE_API_BASE_URL: process.env.JETSCOPE_API_BASE_URL,
    SAFVSOIL_API_BASE_URL: process.env.SAFVSOIL_API_BASE_URL,
    JETSCOPE_API_PREFIX: process.env.JETSCOPE_API_PREFIX,
    SAFVSOIL_API_PREFIX: process.env.SAFVSOIL_API_PREFIX
  };

  for (const key of Object.keys(previous)) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  try {
    return await import(`../apps/web/lib/api-config.ts?test=${Date.now()}-${Math.random()}`);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('buildApiUrl normalizes base URL, prefix, and endpoint slashes', async () => {
  const { API_BASE_URL, API_PREFIX, buildApiUrl } = await importApiConfig({
    JETSCOPE_API_BASE_URL: 'https://api.example.com/',
    JETSCOPE_API_PREFIX: 'v1/'
  });

  assert.equal(API_BASE_URL, 'https://api.example.com');
  assert.equal(API_PREFIX, '/v1');
  assert.equal(buildApiUrl('market/snapshot'), 'https://api.example.com/v1/market/snapshot');
  assert.equal(buildApiUrl('/market/snapshot'), 'https://api.example.com/v1/market/snapshot');
});

test('buildApiUrl keeps same-origin defaults stable', async () => {
  const { API_BASE_URL, API_PREFIX, buildApiUrl } = await importApiConfig();

  assert.equal(API_BASE_URL, '');
  assert.equal(API_PREFIX, '/v1');
  assert.equal(buildApiUrl('/health'), '/v1/health');
});
