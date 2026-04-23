import { performance } from 'node:perf_hooks';

import { startMockedServer } from '../test/helpers/server-harness.mjs';

const RUNS = [
  { label: 'health', pathname: '/api/health', method: 'GET', concurrency: 40, iterations: 200 },
  { label: 'market-data', pathname: '/api/market-data', method: 'GET', concurrency: 20, iterations: 80 },
  {
    label: 'local-preferences-put',
    pathname: '/api/local-preferences',
    method: 'PUT',
    concurrency: 12,
    iterations: 60,
    body: JSON.stringify({
      preferences: {
        crudeSource: 'manual',
        carbonSource: 'manual',
        benchmarkMode: 'crude-proxy',
        carbonPriceUsdPerTonne: 135,
        subsidyUsdPerLiter: 0.65,
        jetProxySlope: 0.0088,
        jetProxyIntercept: 0.16
      },
      routeEdits: {
        'sugar-atj': {
          baseCostUsdPerLiter: 1.88,
          co2SavingsKgPerLiter: 1.72
        }
      }
    })
  }
];

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

async function runLoadCase(baseUrl, config) {
  const latencies = [];
  let cursor = 0;
  let failures = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= config.iterations) {
        return;
      }

      const startedAt = performance.now();
      try {
        const response = await fetch(`${baseUrl}${config.pathname}`, {
          method: config.method,
          headers: config.body ? { 'content-type': 'application/json' } : undefined,
          body: config.body
        });
        if (!response.ok) {
          failures += 1;
        }
        await response.text();
      } catch {
        failures += 1;
      } finally {
        latencies.push(performance.now() - startedAt);
      }
    }
  }

  const suiteStartedAt = performance.now();
  await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
  const durationMs = performance.now() - suiteStartedAt;

  const mean = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  return {
    ...config,
    totalMs: durationMs,
    failures,
    meanMs: mean,
    p95Ms: percentile(latencies, 0.95),
    maxMs: Math.max(...latencies)
  };
}

const server = await startMockedServer();

try {
  const baseUrl = `http://127.0.0.1:${server.port}`;
  console.log(`Preflight load test target: ${baseUrl}`);

  for (const config of RUNS) {
    const result = await runLoadCase(baseUrl, config);
    console.log(
      [
        `${result.label}:`,
        `${result.iterations} requests`,
        `concurrency=${result.concurrency}`,
        `failures=${result.failures}`,
        `mean=${result.meanMs.toFixed(1)}ms`,
        `p95=${result.p95Ms.toFixed(1)}ms`,
        `max=${result.maxMs.toFixed(1)}ms`,
        `total=${result.totalMs.toFixed(1)}ms`
      ].join(' ')
    );

    if (result.failures > 0) {
      process.exitCode = 1;
      throw new Error(`Load test ${result.label} had ${result.failures} failures`);
    }
  }
} finally {
  await server.close();
}
