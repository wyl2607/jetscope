import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ROUTE_FIXTURE,
  getBreakevenListRowsFixture,
  getRoute,
  computeRouteSnapshot,
  computeRouteSnapshotWithoutPolicy
} from './helpers/wave1-fixtures.mjs';

test('homepage parity summary uses a stable effective-cost multiple for the cheapest SAF route', () => {
  const sugarAtj = getRoute('sugar-atj');
  const withPolicy = computeRouteSnapshot(sugarAtj, DEFAULT_ROUTE_FIXTURE);

  assert.ok(withPolicy.costMultiple > 1);
  assert.ok(Math.abs(withPolicy.costMultiple - 1.0004146796599626) < 1e-9);
  assert.equal(withPolicy.competitiveness, '≈ 接近盈亏平衡');
});

test('breakeven route list keeps policy-adjusted threshold below the no-policy threshold', () => {
  const rows = getBreakevenListRowsFixture(DEFAULT_ROUTE_FIXTURE);

  assert.equal(rows[0].route.id, 'sugar-atj');
  assert.ok(rows[0].withPolicy.breakEvenCrude < rows[0].withoutPolicy.breakEvenCrude);
  assert.ok(rows.every((row, index, list) => index === 0 || list[index - 1].withPolicy.breakEvenCrude <= row.withPolicy.breakEvenCrude));
});

test('without-policy math removes carbon credit and subsidy from the parity threshold', () => {
  const route = getRoute('reed-hefa');
  const withPolicy = computeRouteSnapshot(route, DEFAULT_ROUTE_FIXTURE);
  const withoutPolicy = computeRouteSnapshotWithoutPolicy(route, DEFAULT_ROUTE_FIXTURE);

  assert.ok(withoutPolicy.effectiveCost > withPolicy.effectiveCost);
  assert.ok(withoutPolicy.breakEvenCrude > withPolicy.breakEvenCrude);
  assert.equal(withoutPolicy.carbonCredit, 0);
});
