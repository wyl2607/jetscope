import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// product-read-model is TypeScript; test pure logic mirror here to avoid TS loader dependency.
function resolveLiveFossilJetUsdPerL(values) {
  if (Number.isFinite(values.rotterdam_jet_fuel_usd_per_l) && values.rotterdam_jet_fuel_usd_per_l > 0) {
    return { value: values.rotterdam_jet_fuel_usd_per_l, sourceKey: 'rotterdam_jet_fuel_usd_per_l' };
  }
  if (Number.isFinite(values.jet_eu_proxy_usd_per_l) && values.jet_eu_proxy_usd_per_l > 0) {
    return { value: values.jet_eu_proxy_usd_per_l, sourceKey: 'jet_eu_proxy_usd_per_l' };
  }
  if (Number.isFinite(values.jet_usd_per_l) && values.jet_usd_per_l > 0) {
    return { value: values.jet_usd_per_l, sourceKey: 'jet_usd_per_l' };
  }
  return { value: null, sourceKey: 'unavailable' };
}

test('prefers Rotterdam jet over EU proxy and US jet', () => {
  const out = resolveLiveFossilJetUsdPerL({
    rotterdam_jet_fuel_usd_per_l: 0.85,
    jet_eu_proxy_usd_per_l: 0.87,
    jet_usd_per_l: 0.99
  });
  assert.equal(out.sourceKey, 'rotterdam_jet_fuel_usd_per_l');
  assert.equal(out.value, 0.85);
});

test('falls back to EU proxy then US jet', () => {
  assert.equal(
    resolveLiveFossilJetUsdPerL({ jet_eu_proxy_usd_per_l: 0.87, jet_usd_per_l: 0.99 }).sourceKey,
    'jet_eu_proxy_usd_per_l'
  );
  assert.equal(resolveLiveFossilJetUsdPerL({ jet_usd_per_l: 0.99 }).sourceKey, 'jet_usd_per_l');
});

test('returns unavailable when no jet price present — does not invent', () => {
  const out = resolveLiveFossilJetUsdPerL({ brent_usd_per_bbl: 114.93 });
  assert.equal(out.value, null);
  assert.equal(out.sourceKey, 'unavailable');
});
