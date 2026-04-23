import test from 'node:test';
import assert from 'node:assert/strict';

import { parseUrlState } from '../public/_state/url-state.js';

test('parseUrlState parses numeric and string shareable explorer params', () => {
  const parsed = parseUrlState(
    '?crude=120&carbon=150&subsidy=0.6&benchmarkMode=live-jet-spot&crudeSource=manual&carbonSource=cbamCarbonProxyUsd&scenario=test-1'
  );

  assert.equal(parsed.crude, 120);
  assert.equal(parsed.carbon, 150);
  assert.equal(parsed.subsidy, 0.6);
  assert.equal(parsed.benchmarkMode, 'live-jet-spot');
  assert.equal(parsed.crudeSource, 'manual');
  assert.equal(parsed.carbonSource, 'cbamCarbonProxyUsd');
  assert.equal(parsed.scenario, 'test-1');
});

test('parseUrlState ignores invalid numeric values', () => {
  const parsed = parseUrlState('?crude=abc&carbon=&subsidy=1.25');
  assert.equal(parsed.crude, undefined);
  assert.equal(parsed.carbon, undefined);
  assert.equal(parsed.subsidy, 1.25);
});
