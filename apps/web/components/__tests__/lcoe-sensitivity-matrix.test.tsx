import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LcoeSensitivityMatrix } from '@/components/lcoe-sensitivity-matrix';
import type { GridLcoeSensitivityResponse } from '@/lib/grid-parity-read-model';

const sensitivity: GridLcoeSensitivityResponse = {
  generated_at: '2026-06-06T00:00:00.000Z',
  tech_key: 'solar_pv',
  tech_name: '光伏',
  fossil_reference_key: 'gas_ccgt',
  discount_rates: [0.05, 0.08],
  full_load_hours: [1000, 1500],
  cells: [
    {
      discount_rate: 0.05,
      full_load_hours: 1000,
      lcoe_eur_per_mwh: 55,
      breakeven_carbon_price_eur_per_t: 42
    },
    {
      discount_rate: 0.08,
      full_load_hours: 1000,
      lcoe_eur_per_mwh: 64,
      breakeven_carbon_price_eur_per_t: 55
    },
    {
      discount_rate: 0.05,
      full_load_hours: 1500,
      lcoe_eur_per_mwh: 44,
      breakeven_carbon_price_eur_per_t: 28
    },
    {
      discount_rate: 0.08,
      full_load_hours: 1500,
      lcoe_eur_per_mwh: 50,
      breakeven_carbon_price_eur_per_t: 36
    }
  ],
  disclaimer: '测试免责声明'
};

describe('LcoeSensitivityMatrix', () => {
  it('renders the initial matrix and technology selector', () => {
    render(<LcoeSensitivityMatrix initial={sensitivity} />);

    const selector = screen.getByLabelText(/发电技术/) as HTMLSelectElement;

    expect(selector.value).toBe('solar_pv');
    expect(screen.getByRole('option', { name: '陆上风电' })).toBeInTheDocument();
    expect(screen.getByText('5% WACC')).toBeInTheDocument();
    expect(screen.getByText('€42/t')).toBeInTheDocument();
    expect(screen.getByText(/当前技术：光伏/)).toBeInTheDocument();
  });
});
