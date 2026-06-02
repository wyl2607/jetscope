import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuEtsPressurePanel } from '@/components/eu-ets-pressure-panel';
import type { EuEtsPressureViewModel } from '@/lib/eu-ets-pressure-read-model';

const model: EuEtsPressureViewModel = {
  generatedAt: '2026-06-01T00:00:00Z',
  signal: 'high',
  signalLabel: '高压力',
  peakPressurePct: 27,
  points: [
    { eu_ets_eur_per_t: 0, carbon_cost_usd_per_l: 0, effective_fossil_jet_usd_per_l: 1.0, pressure_pct: 0 },
    { eu_ets_eur_per_t: 100, carbon_cost_usd_per_l: 0.27, effective_fossil_jet_usd_per_l: 1.27, pressure_pct: 27 }
  ],
  source: { source_type: 'derived', confidence_score: 0.7, cadence: 'quarterly', updated_at: '2026-04-23', fallback_used: false }
};

describe('EuEtsPressurePanel', () => {
  it('renders the pressure signal and rows', () => {
    const { getByText, container } = render(<EuEtsPressurePanel model={model} />);
    expect(getByText(/高压力/)).not.toBeNull();
    expect(getByText(/峰值 27.0%/)).not.toBeNull();
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('renders source-trust footnote', () => {
    const { getByText } = render(<EuEtsPressurePanel model={model} />);
    expect(getByText(/derived/)).not.toBeNull();
    expect(getByText(/置信度 70%/)).not.toBeNull();
  });
});
