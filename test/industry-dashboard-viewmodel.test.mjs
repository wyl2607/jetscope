import test from 'node:test';
import assert from 'node:assert/strict';
import { SAF_ROUTES } from '../data/baselines.mjs';
import { getIndustryDashboardViewModel } from '../public/_shared/industry-dashboard-viewmodel.js';

const mockState = {
  crudeUsdPerBarrel: 80,
  carbonPriceUsdPerTonne: 90,
  subsidyUsdPerLiter: 0.5,
  jetProxySlope: 0.0082,
  jetProxyIntercept: 0.12,
  benchmarkMode: 'crude-proxy',
  routes: structuredClone(SAF_ROUTES)
};

const mockMarketData = {
  timestamp: '2026-04-01T00:00:00Z'
};

test('industry dashboard viewmodel keeps lane-5 baseline contract', () => {
  const viewModel = getIndustryDashboardViewModel(mockState, mockMarketData);
  const pathwayCount = SAF_ROUTES.filter((route) => route.category !== 'fossil').length;

  assert.ok(['threshold', 'watching'].includes(viewModel.signal.status));
  assert.equal(viewModel.countries.length, 8);
  assert.equal(viewModel.airlines.length, 8);
  assert.equal(viewModel.pathways.length, pathwayCount);
  assert.equal(viewModel.bestSafRouteId, 'sugar-atj');
});

test('industry baselines keep explicit as-of marker for manual quarterly review', () => {
  const viewModel = getIndustryDashboardViewModel(mockState, mockMarketData);
  assert.equal(viewModel.baselineAsOf, '2026-Q1');
  assert.match(viewModel.countries[0].sourceNote, /2026-Q1/);
  assert.match(viewModel.airlines[0].sourceNote, /2026-Q1/);
});

test('timeline past/future status anchors to marketData.timestamp, not runtime clock', () => {
  const reference2026 = getIndustryDashboardViewModel(mockState, {
    timestamp: '2026-01-15T00:00:00Z'
  });
  const year2027At2026 = reference2026.timeline.find((item) => item.year === 2027);
  assert.equal(year2027At2026?.isPast, false);

  const reference2028 = getIndustryDashboardViewModel(mockState, {
    timestamp: '2028-01-15T00:00:00Z'
  });
  const year2027At2028 = reference2028.timeline.find((item) => item.year === 2027);
  assert.equal(year2027At2028?.isPast, true);
});

test('industry signal tone moves to viable when subsidy closes parity gap', () => {
  const withHigherSubsidy = getIndustryDashboardViewModel(
    {
      ...mockState,
      subsidyUsdPerLiter: 1.2
    },
    mockMarketData
  );

  assert.equal(withHigherSubsidy.signal.status, 'viable');
  assert.ok(withHigherSubsidy.signal.gapUsdPerLiter <= 0);
});
