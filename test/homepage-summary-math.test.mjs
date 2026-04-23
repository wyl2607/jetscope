import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ROUTE_FIXTURE,
  computeRouteSnapshot,
  computeRouteSnapshotWithoutPolicy,
  getBreakevenListRowsFixture,
  getRoute,
  selectCheapestSafRoute
} from './helpers/wave1-fixtures.mjs';

test('homepage summary route math exposes costMultiple for cheapest SAF', () => {
  const { route, snapshot } = selectCheapestSafRoute(DEFAULT_ROUTE_FIXTURE);

  assert.equal(route.id, 'sugar-atj');
  assert.ok(Math.abs(snapshot.costMultiple - 1.0004146796599627) < 1e-12);
});

test('no-policy break-even stays above with-policy break-even for subsidized SAF routes', () => {
  const sugarRoute = getRoute('sugar-atj');
  const withPolicy = computeRouteSnapshot(sugarRoute, DEFAULT_ROUTE_FIXTURE);
  const withoutPolicy = computeRouteSnapshotWithoutPolicy(sugarRoute, DEFAULT_ROUTE_FIXTURE);

  assert.ok(withoutPolicy.breakEvenCrude > withPolicy.breakEvenCrude);
  assert.ok(Math.abs(withoutPolicy.breakEvenCrude - 180.48780487804876) < 1e-9);
});

test('homepage breakeven list fixture sorts by with-policy break-even and keeps sugar first', () => {
  const rows = getBreakevenListRowsFixture(DEFAULT_ROUTE_FIXTURE);

  assert.equal(rows[0].route.id, 'sugar-atj');
  assert.ok(rows[0].withPolicy.breakEvenCrude < rows[1].withPolicy.breakEvenCrude);
});
