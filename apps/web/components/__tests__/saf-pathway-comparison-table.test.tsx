import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { toPathwayCostRow } from '@/lib/pathways-read-model';

const hefaFixture = toPathwayCostRow(
  {
    pathway_key: 'hefa',
    display_name: 'HEFA',
    net_cost_low_usd_per_l: 1.8,
    net_cost_high_usd_per_l: 2.2,
    spread_low_pct: 10,
    spread_high_pct: 20,
    status: 'inflection'
  },
  { asOf: null, basis: 'assumption', method: 'test fixture pathway cost' }
);

describe('SafPathwayComparisonTable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaFixture]} />
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('renders source-trust column when sources provided', () => {
    const { getByText } = render(
      <SafPathwayComparisonTable
        selectedPathwayKey="hefa"
        pathways={[hefaFixture]}
        sources={{
          hefa: {
            sourceType: 'market_feed',
            confidencePct: 80,
            confidenceLabel: '高',
            freshnessLabel: '2026-06-01 · daily',
            fallbackUsed: false
          }
        }}
      />
    );

    expect(getByText('来源可信度')).not.toBeNull();
    expect(getByText(/market_feed/)).not.toBeNull();
  });

  it('renders pathway attributes from mocked API data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          {
            pathway_key: 'hefa',
            carbon_reduction_pct: 73,
            maturity_level: 'commercial'
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaFixture]} />);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/pathways/compare?fossil_jet_usd_per_l=1')).toBe(true);
    });
    expect(screen.getByText('73%')).toBeInTheDocument();
    expect(screen.getByText('商业化')).toBeInTheDocument();
  });
});
