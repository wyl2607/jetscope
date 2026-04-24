import assert from 'node:assert/strict';
import test from 'node:test';

import { importWebLib } from './helpers/load-web-lib.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain' }
  });
}

function installEnv(t, nextEnv = {}) {
  const previous = new Map();
  const env = {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1',
    ...nextEnv
  };
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function installFetchStub(t, handlers) {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = String(input);
    const handler = handlers.get(url);
    if (!handler) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return handler(init);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
}

test('portfolio read model normalizes research signal response variants', async (t) => {
  installEnv(t, { JETSCOPE_AI_RESEARCH_ENABLED: 'true' });
  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/research/signals?since=2026-03-24T12%3A00%3A00.000Z&limit=20',
        () =>
          jsonResponse({
            signals: [
              {
                signal_id: 'sig-1',
                type: 'policy',
                raw_title: 'ReFuelEU update',
                impact_direction: 'bullish_saf',
                confidence_score: 1.4,
                summary: 'SAF mandate support increased.',
                generated_at: '2026-04-23T12:00:00Z'
              }
            ]
          })
      ]
    ])
  );
  const originalDateNow = Date.now;
  Date.now = () => new Date('2026-04-23T12:00:00Z').getTime();
  t.after(() => {
    Date.now = originalDateNow;
  });

  const { getResearchSignals } = await importWebLib('apps/web/lib/portfolio-read-model.ts');
  const result = await getResearchSignals();

  assert.equal(result.status, 'ok');
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].id, 'sig-1');
  assert.equal(result.signals[0].signal_type, 'policy');
  assert.equal(result.signals[0].impact_direction, 'positive');
  assert.equal(result.signals[0].confidence, 1);
});

test('portfolio read model surfaces missing research API as not_found', async (t) => {
  installEnv(t, { JETSCOPE_AI_RESEARCH_ENABLED: 'true' });
  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/research/signals?since=2026-03-24T12%3A00%3A00.000Z&limit=20',
        () => jsonResponse({ detail: 'not found' }, 404)
      ]
    ])
  );
  const originalDateNow = Date.now;
  Date.now = () => new Date('2026-04-23T12:00:00Z').getTime();
  t.after(() => {
    Date.now = originalDateNow;
  });

  const { getResearchSignals } = await importWebLib('apps/web/lib/portfolio-read-model.ts');
  const result = await getResearchSignals();

  assert.equal(result.status, 'not_found');
  assert.deepEqual(result.signals, []);
});

test('portfolio read model reports invalid JSON as degraded error', async (t) => {
  installEnv(t, { JETSCOPE_AI_RESEARCH_ENABLED: 'true' });
  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/research/signals?since=2026-03-24T12%3A00%3A00.000Z&limit=20',
        () => textResponse('not-json')
      ]
    ])
  );
  const originalDateNow = Date.now;
  Date.now = () => new Date('2026-04-23T12:00:00Z').getTime();
  t.after(() => {
    Date.now = originalDateNow;
  });

  const { getResearchSignals } = await importWebLib('apps/web/lib/portfolio-read-model.ts');
  const result = await getResearchSignals();

  assert.equal(result.status, 'error');
  assert.match(result.message, /invalid JSON response/);
});

test('portfolio read model bounds stalled fetches with configurable timeout', async (t) => {
  installEnv(t, {
    JETSCOPE_AI_RESEARCH_ENABLED: 'true',
    JETSCOPE_PORTFOLIO_FETCH_TIMEOUT_MS: '100'
  });
  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/research/signals?since=2026-03-24T12%3A00%3A00.000Z&limit=20',
        (init) =>
          new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            setTimeout(() => resolve(jsonResponse([])), 500);
          })
      ]
    ])
  );
  const originalDateNow = Date.now;
  Date.now = () => new Date('2026-04-23T12:00:00Z').getTime();
  t.after(() => {
    Date.now = originalDateNow;
  });

  const { getResearchSignals } = await importWebLib('apps/web/lib/portfolio-read-model.ts');
  const result = await getResearchSignals();

  assert.equal(result.status, 'error');
  assert.match(result.message, /HTTP 408: timeout after 100ms/);
});
