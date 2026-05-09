import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransitionReadinessDashboard } from '@/components/transition-readiness-dashboard';

describe('TransitionReadinessDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TransitionReadinessDashboard
        initialTippingPoint={{
          signal: 'inflection',
          inputs: {
            fossil_jet_usd_per_l: 1.2,
            carbon_price_eur_per_t: 80,
            subsidy_usd_per_l: 0.2,
            blend_rate_pct: 2
          },
          effective_fossil_jet_usd_per_l: 1.3,
          pathways: [
            {
              pathway_key: 'hefa',
              display_name: 'HEFA',
              net_cost_low_usd_per_l: 1.8,
              net_cost_high_usd_per_l: 2.1,
              spread_low_pct: 8,
              spread_high_pct: 15,
              status: 'inflection'
            }
          ]
        }}
        initialDecision={{
          signal: 'cut_capacity',
          inputs: { pathway_key: 'hefa' },
          probabilities: {
            raise_fares: 0.2,
            cut_capacity: 0.3,
            buy_spot_saf: 0.1,
            sign_long_term_offtake: 0.25,
            ground_routes: 0.15
          }
        }}
        initialReserve={{
          coverage_weeks: 4,
          coverage_days: 28,
          stress_level: 'normal',
          estimated_supply_gap_pct: 5,
          source_type: 'model',
          source_name: 'mock',
          generated_at: new Date().toISOString(),
          confidence_score: 0.85
        }}
        policyTargets={[
          {
            year: 2030,
            saf_share_pct: 6,
            synthetic_share_pct: 1.2,
            label: 'Target'
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
