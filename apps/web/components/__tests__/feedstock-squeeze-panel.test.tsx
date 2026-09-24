import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeedstockSqueezePanel } from '@/components/feedstock-squeeze-panel';
import type { FeedstockSqueeze } from '@/lib/feedstock-read-model';

const data: FeedstockSqueeze = {
  generated_at: '2026-09-23T17:00:00Z',
  uco: {
    week_ending: '2026-09-10',
    published_at: '2026-09-15',
    ddp_nwe_eur_per_t: 1285,
    ddp_nwe_low_eur_per_t: 1280,
    ddp_nwe_high_eur_per_t: 1290,
    age_days: 13,
    stale: false,
    source_name: 'Fastmarkets week',
    source_url: 'https://example.test/week',
    prior_year: {
      year: 2025,
      low_eur_per_t: 1070,
      low_date: '2025-03-28',
      high_eur_per_t: 1207.5,
      high_date: '2025-02-21',
      vs_high_pct: 6.4,
      vs_low_pct: 20.1,
      source_name: 'Fastmarkets year',
      source_url: 'https://example.test/year'
    }
  },
  uco_vs_gasoil: { week_ending: '2026-09-10', uco_cif_ara_bulk_usd_per_t: 1370, ice_gasoil_usd_per_t: 1464, ratio: 0.94 },
  structure: {
    period: '2025',
    published_at: '2026-09-17',
    aviation_biofuel_share_of_saf_pct: 80,
    feedstock_imported_pct: 85,
    china_share_of_imports_pct: 61,
    source_name: 'EASA ATR 2026',
    source_url: 'https://example.test/easa'
  }
};

describe('FeedstockSqueezePanel', () => {
  it('shows the three readings with their sources', () => {
    render(<FeedstockSqueezePanel locale="en" data={data} />);

    expect(screen.getByText(/EUR 1,280–1,290\/t/).textContent).toContain('EUR 1,070–1,207.50/t: now +6.4%');
    expect(screen.getByText(/a ratio of 0\.94/)).toBeTruthy();
    expect(screen.getByText(/85% of feedstock was imported, 61% of imports from China/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fastmarkets year' })).toHaveAttribute('href', 'https://example.test/year');
    expect(screen.queryByText(/^Stale:/)).toBeNull();
  });

  it('warns when the curated price is stale', () => {
    render(<FeedstockSqueezePanel locale="zh" data={{ ...data, uco: { ...data.uco, age_days: 45, stale: true } }} />);

    expect(screen.getByText('数据陈旧：最新 UCO 价格是 2026-09-10 当周，已过去 45 天。')).toBeTruthy();
  });

  it('says so instead of estimating when data is missing', () => {
    render(<FeedstockSqueezePanel locale="de" data={null} />);

    expect(screen.getByText('Rohstoffpreise nicht geladen; es wird keine Schätzung gezeigt.')).toBeTruthy();
  });
});
