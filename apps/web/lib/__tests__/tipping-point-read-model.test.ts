import { describe, expect, it } from 'vitest';

import { toTippingPointReadModel, type TippingPointResponse } from '../product-read-model';

const response: TippingPointResponse = {
  generated_at: '2026-09-23T18:00:00Z',
  inputs: { fossil_jet_usd_per_l: 1.092, carbon_price_eur_per_t: 85, subsidy_usd_per_l: 0, blend_rate_pct: 0 },
  effective_fossil_jet_usd_per_l: 1.335,
  pathways: [
    {
      pathway_key: 'hefa',
      display_name: 'HEFA',
      net_cost_low_usd_per_l: 1.4911,
      net_cost_high_usd_per_l: 1.4911,
      spread_low_pct: 11.7,
      spread_high_pct: 11.7,
      status: 'inflection'
    }
  ],
  signal: 'fossil_still_advantaged'
};

describe('toTippingPointReadModel', () => {
  it('labels pathway costs as derived estimates, never observed market prints', () => {
    const row = toTippingPointReadModel(response)!.pathways[0];

    for (const figure of [row.netCostLow, row.netCostHigh, row.spreadLow, row.spreadHigh]) {
      expect(figure.basis).toBe('derived');
      expect(figure.basis).not.toBe('observed');
    }
  });
});
