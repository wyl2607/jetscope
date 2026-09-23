import { describe, expect, it } from 'vitest';
import { presentDashboardMarket, presentQuote } from '@/lib/market-quote-read-model';

describe('market quote presentation', () => {
  it('never prints a number for a missing quote', () => {
    const missingPayloadValue = 0.73;
    const shown = presentQuote('jet_usd_per_l', { status: 'missing', value: missingPayloadValue }, 'zh');
    expect(shown.text).toBe('—');
    expect(shown.badge).toBe('数据缺失');
    expect(shown.text).not.toMatch(/0\.64/);
    expect(shown.slot).toBe('missing');
  });

  it('shows a stale value with its observation day', () => {
    const shown = presentQuote(
      'jet_usd_per_l',
      { status: 'stale', value: 0.551, asOf: '2026-09-18T00:00:00Z' },
      'zh'
    );
    expect(shown.text).toBe('0.551');
    expect(shown.badge).toBe('截至 2026-09-18');
    expect(shown.slot).toBe('primary');
  });

  it('puts an estimate in the secondary slot with its method', () => {
    const shown = presentQuote(
      'rotterdam_jet_fuel_usd_per_l',
      { status: 'estimated', value: 0.604, method: 'Brent × 1.20' },
      'zh'
    );
    expect(shown.badge).toBe('估算');
    expect(shown.title).toBe('Brent × 1.20');
    expect(shown.slot).toBe('secondary');
  });

  it('keeps only live and stale quotes in the dashboard primary slot', () => {
    const missingValue = 0.73;
    const shown = presentDashboardMarket(
      {
        values: {
          brent_usd_per_bbl: 80,
          jet_usd_per_l: missingValue,
          rotterdam_jet_fuel_usd_per_l: 0.604,
          carbon_proxy_usd_per_t: null
        },
        source_details: {
          brent: { status: 'live', value: 80 },
          jet: { status: 'missing', value: null },
          rotterdam_jet_fuel: { status: 'estimated', value: 0.604, method: 'Brent × 1.20' },
          carbon: { status: 'missing', value: null }
        }
      },
      'zh'
    );
    expect(shown.mode).toBe('quotes');
    expect(shown.primary).toContain('最新价');
    expect(shown.primary).toContain('80.00');
    expect(shown.primary).not.toContain(String(missingValue));
    expect(shown.primary).not.toContain('0.604');
    expect(shown.secondary).toContain('估算');
    expect(shown.secondary).toContain('Brent × 1.20');
    expect(shown.secondary).toContain('数据缺失');
    expect(shown.secondary).not.toMatch(/航煤 [^—]/);
  });
});
