import assert from 'node:assert/strict';
import test from 'node:test';

import { importWebLib } from './helpers/load-web-lib.mjs';

test('market signal helpers centralize dashboard, reserve, and signal semantics', async () => {
  const {
    computeDashboardAlertBanners,
    getReserveSeverity,
    getTippingPointSignalMeta,
    getAirlineDecisionSignalLabel,
    getPathwayStatusLabel
  } = await importWebLib('apps/web/lib/market-signals.ts');

  const banners = computeDashboardAlertBanners(
    {
      values: {
        jet_eu_proxy_usd_per_l: 1.31,
        jet_usd_per_l: 1.04
      }
    },
    {
      metric: 'Brent',
      metricKey: 'brent_usd_per_bbl',
      window: '1d',
      changePct: 12.5,
      level: 'watch',
      latestAsOf: '2026-04-23T12:00:00Z',
      sampleCount: 1
    }
  );

  assert.equal(banners.length, 2);
  assert.equal(banners[0].title, 'Jet Fuel Price Alert');
  assert.equal(banners[1].title, 'SAF Inflection Alert');

  assert.equal(getReserveSeverity(1.8).level, 'critical');
  assert.equal(getReserveSeverity(3.5).level, 'elevated');
  assert.equal(getReserveSeverity(5.5).level, 'watch');
  assert.equal(getReserveSeverity(7).level, 'normal');

  assert.deepEqual(getTippingPointSignalMeta('saf_cost_advantaged', 'zh'), {
    tone: 'teal',
    label: 'SAF 已占优'
  });
  assert.deepEqual(getTippingPointSignalMeta('switch_window_opening', 'en'), {
    tone: 'amber',
    label: 'Switch window opening'
  });
  assert.equal(getAirlineDecisionSignalLabel('capacity_stress_dominant'), 'Capacity stress dominant');
  assert.equal(getPathwayStatusLabel('premium'), 'Fossil still advantaged');
});
