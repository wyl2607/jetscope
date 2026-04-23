import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ROUTE_FIXTURE,
  computeRouteSnapshot,
  getRoute,
  selectCheapestSafRoute
} from './helpers/wave1-fixtures.mjs';

test('default route math keeps sugar ATJ nearest to parity under proxy benchmark', () => {
  const { route, snapshot } = selectCheapestSafRoute(DEFAULT_ROUTE_FIXTURE);

  assert.equal(route.id, 'sugar-atj');
  assert.equal(snapshot.competitiveness, '≈ 接近盈亏平衡');
  assert.ok(Math.abs(snapshot.effectiveCost - 0.965) < 1e-9);
  assert.ok(Math.abs(snapshot.delta - 0.0004) < 1e-9);
  assert.ok(Math.abs(snapshot.breakEvenCrude - 103.04878048780488) < 1e-9);
});

test('fossil Jet-A fixture receives no carbon credit and stays below the proxy benchmark', () => {
  const snapshot = computeRouteSnapshot(getRoute('jet-a'));

  assert.equal(snapshot.carbonCredit, 0);
  assert.equal(snapshot.competitiveness, '✓ 已具竞争力');
  assert.ok(Math.abs(snapshot.benchmarkPrice - 0.9646) < 1e-9);
  assert.ok(snapshot.delta < 0);
});
