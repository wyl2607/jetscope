import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The shipped implementation of this fallback chain is Python:
//   apps/api/app/api/routes/analysis.py            _resolve_fossil_jet_usd_per_l
//   apps/api/app/services/analysis/tipping_point.py TippingPointEngine.FOSSIL_METRIC_PRIORITY
// There is no JS implementation to import, so the behavioural tests below run
// against a mirror. A mirror asserted only against itself cannot fail, so the
// first test pins the mirror's order to the Python source of truth: if either
// Python site reorders, adds or drops a metric, this goes red and points
// whoever changed it at the mirror.

const FOSSIL_JET_PRIORITY = [
  'rotterdam_jet_fuel_usd_per_l',
  'jet_eu_proxy_usd_per_l',
  'jet_usd_per_l'
];

function resolveLiveFossilJetUsdPerL(values, details = {}) {
  const SIGNAL = new Set(['observed', 'stale', 'derived']);
  for (const key of FOSSIL_JET_PRIORITY) {
    const value = values[key];
    const detail = details[key] || {};
    const quality = detail.quality || (detail.fallback_used ? 'seed' : 'observed');
    if (Number.isFinite(value) && value > 0 && SIGNAL.has(quality)) {
      return { value, sourceKey: key };
    }
  }
  return { value: null, sourceKey: 'unavailable' };
}

async function extractPythonTuple(relPath, anchor) {
  const source = await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
  const at = source.indexOf(anchor);
  assert.notEqual(
    at,
    -1,
    `Could not find ${anchor} in ${relPath}. The fossil-jet fallback chain moved; ` +
      're-point this test at its new home rather than deleting the check.'
  );
  const open = source.indexOf('(', at + anchor.length);
  const close = source.indexOf(')', open);
  assert.ok(open !== -1 && close > open, `Could not parse the tuple after ${anchor} in ${relPath}`);
  return [...source.slice(open, close).matchAll(/["']([a-z0-9_]+)["']/g)].map((match) => match[1]);
}

test('the JS mirror matches the fossil-jet priority the API actually ships', async () => {
  const analysisSource = await readFile(new URL('../apps/api/app/api/routes/analysis.py', import.meta.url), 'utf8');
  assert.match(analysisSource, /select_fossil_jet_benchmark/);
  assert.doesNotMatch(
    analysisSource,
    /for key in \("rotterdam_jet_fuel_usd_per_l"/,
    'analysis.py must not fall back to the first positive number after the quality selector rejects'
  );
  const engineChain = await extractPythonTuple(
    'apps/api/app/services/analysis/tipping_point.py',
    'FOSSIL_METRIC_PRIORITY'
  );

  assert.deepEqual(engineChain, FOSSIL_JET_PRIORITY);
});

test('prefers Rotterdam jet over EU proxy and US jet', () => {
  const out = resolveLiveFossilJetUsdPerL(
    {
      rotterdam_jet_fuel_usd_per_l: 0.85,
      jet_eu_proxy_usd_per_l: 0.87,
      jet_usd_per_l: 0.99
    },
    {
      rotterdam_jet_fuel_usd_per_l: { quality: 'observed' },
      jet_eu_proxy_usd_per_l: { quality: 'derived' },
      jet_usd_per_l: { quality: 'observed' }
    }
  );
  assert.equal(out.sourceKey, 'rotterdam_jet_fuel_usd_per_l');
  assert.equal(out.value, 0.85);
});

test('does not take a seed Rotterdam print after the quality selector rejects', () => {
  const out = resolveLiveFossilJetUsdPerL(
    {
      rotterdam_jet_fuel_usd_per_l: 0.657,
      jet_eu_proxy_usd_per_l: 0.657,
      jet_usd_per_l: 0.64
    },
    {
      rotterdam_jet_fuel_usd_per_l: { quality: 'seed', fallback_used: true },
      jet_eu_proxy_usd_per_l: { quality: 'seed', fallback_used: true },
      jet_usd_per_l: { quality: 'seed', fallback_used: true }
    }
  );
  assert.equal(out.sourceKey, 'unavailable');
  assert.equal(out.value, null);
});

test('falls back to EU proxy then US jet', () => {
  assert.equal(
    resolveLiveFossilJetUsdPerL({ jet_eu_proxy_usd_per_l: 0.87, jet_usd_per_l: 0.99 }).sourceKey,
    'jet_eu_proxy_usd_per_l'
  );
  assert.equal(resolveLiveFossilJetUsdPerL({ jet_usd_per_l: 0.99 }).sourceKey, 'jet_usd_per_l');
});

test('skips non-positive and non-finite readings rather than trusting them', () => {
  const out = resolveLiveFossilJetUsdPerL({
    rotterdam_jet_fuel_usd_per_l: 0,
    jet_eu_proxy_usd_per_l: Number.NaN,
    jet_usd_per_l: 0.99
  });
  assert.equal(out.sourceKey, 'jet_usd_per_l');
});

test('returns unavailable when no jet price present — does not invent', () => {
  const out = resolveLiveFossilJetUsdPerL({ brent_usd_per_bbl: 114.93 });
  assert.equal(out.value, null);
  assert.equal(out.sourceKey, 'unavailable');
});
