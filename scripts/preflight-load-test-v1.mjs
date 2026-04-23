import { performance } from 'node:perf_hooks';

/**
 * SAFvsOil v1 API Load Test
 *
 * Targets:
 *   - 1000 req/min (~17 req/s sustained)
 *   - p95 latency < 100ms for /v1/market/snapshot
 *   - Zero failures
 *
 * Endpoints tested:
 *   GET /v1/market/snapshot   (primary — must be fast)
 *   GET /v1/market/history    (secondary — heavier)
 *   GET /v1/health            (baseline)
 *
 * Usage:
 *   node scripts/preflight-load-test-v1.mjs [BASE_URL]
 *
 * Defaults to http://127.0.0.1:8000
 */

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8000';

// Target: 1000 req/min = ~17 req/s. We run bursts to simulate realistic traffic.
const RUNS = [
  {
    label: 'health',
    pathname: '/v1/health',
    method: 'GET',
    concurrency: 10,
    iterations: 200,
    maxP95Ms: 50,
  },
  {
    label: 'market-snapshot',
    pathname: '/v1/market/snapshot',
    method: 'GET',
    concurrency: 20,
    iterations: 600, // 600 requests in burst
    maxP95Ms: 100,
  },
  {
    label: 'market-history',
    pathname: '/v1/market/history',
    method: 'GET',
    concurrency: 10,
    iterations: 120,
    maxP95Ms: 200,
  },
];

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  );
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
          headers: { accept: 'application/json' },
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
  const rps = (config.iterations / (durationMs / 1000)).toFixed(1);

  return {
    ...config,
    totalMs: durationMs,
    failures,
    meanMs: mean,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxMs: Math.max(...latencies),
    rps,
  };
}

async function main() {
  console.log(`SAFvsOil v1 Load Test — Target: ${BASE_URL}`);
  console.log(`Goal: 1000 req/min sustained, p95 < 100ms for snapshot\n`);

  let overallPass = true;

  for (const config of RUNS) {
    const result = await runLoadCase(BASE_URL, config);
    const p95Ok = result.p95Ms <= config.maxP95Ms;
    const failOk = result.failures === 0;
    const pass = p95Ok && failOk;

    console.log(
      [
        `${result.label}:`,
        `${result.iterations} requests`,
        `concurrency=${result.concurrency}`,
        `rps=${result.rps}`,
        `failures=${result.failures}`,
        `mean=${result.meanMs.toFixed(1)}ms`,
        `p50=${result.p50Ms.toFixed(1)}ms`,
        `p95=${result.p95Ms.toFixed(1)}ms`,
        `p99=${result.p99Ms.toFixed(1)}ms`,
        `max=${result.maxMs.toFixed(1)}ms`,
        `total=${result.totalMs.toFixed(1)}ms`,
        pass ? '✅ PASS' : '❌ FAIL',
      ].join(' ')
    );

    if (!pass) {
      overallPass = false;
      if (!p95Ok) {
        console.error(
          `  ❌ p95 ${result.p95Ms.toFixed(1)}ms exceeds threshold ${config.maxP95Ms}ms`
        );
      }
      if (!failOk) {
        console.error(`  ❌ ${result.failures} request failures`);
      }
    }
  }

  console.log('');
  if (overallPass) {
    console.log('🎉 All load test targets met.');
    process.exitCode = 0;
  } else {
    console.log('💥 Load test failed. See errors above.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
