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

const hefaSingleCostFixture = toPathwayCostRow(
  {
    pathway_key: 'hefa',
    display_name: 'HEFA',
    net_cost_low_usd_per_l: 1.49,
    net_cost_high_usd_per_l: 1.49,
    spread_low_pct: 10,
    spread_high_pct: 20,
    status: 'inflection'
  },
  { asOf: null, basis: 'assumption', method: 'test fixture pathway cost' }
);

const hefaSingleSpreadFixture = toPathwayCostRow(
  {
    pathway_key: 'hefa',
    display_name: 'HEFA',
    net_cost_low_usd_per_l: 1.8,
    net_cost_high_usd_per_l: 2.2,
    spread_low_pct: 15,
    spread_high_pct: 15,
    status: 'inflection'
  },
  { asOf: null, basis: 'assumption', method: 'test fixture pathway cost' }
);

const hefaSingleBothFixture = toPathwayCostRow(
  {
    pathway_key: 'hefa',
    display_name: 'HEFA',
    net_cost_low_usd_per_l: 1.49,
    net_cost_high_usd_per_l: 1.49,
    spread_low_pct: 15,
    spread_high_pct: 15,
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
            fallbackUsed: false,
            sourceName: null,
            sourceUrl: null
          }
        }}
      />
    );

    expect(getByText('来源可信度')).not.toBeNull();
    expect(getByText(/market_feed/)).not.toBeNull();
  });

  it('links the published source when a pathway has one', () => {
    const { getByRole } = render(
      <SafPathwayComparisonTable
        selectedPathwayKey="hefa"
        pathways={[hefaFixture]}
        sources={{
          hefa: {
            sourceType: 'official',
            confidencePct: 80,
            confidenceLabel: '高',
            freshnessLabel: '2026-02-26 · annual',
            fallbackUsed: false,
            sourceName: 'EASA 2026 Briefing Note',
            sourceUrl: 'https://www.easa.europa.eu/en/downloads/143282/en'
          }
        }}
      />
    );
    expect(getByRole('link', { name: 'EASA 2026 Briefing Note' })).toHaveAttribute(
      'href',
      'https://www.easa.europa.eu/en/downloads/143282/en'
    );
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

  describe('net cost rendering', () => {
    it('renders single value when low equals high', () => {
      render(<SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaSingleCostFixture]} />);

      const netCostCell = screen.getByText((content) => content.includes('1.49 USD/L')).closest('td');
      expect(netCostCell).toBeInTheDocument();
      expect(netCostCell?.textContent).toContain('1.49 USD/L');
      expect(netCostCell?.textContent).not.toContain('–');
    });

    it('renders range when low differs from high', () => {
      render(<SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaFixture]} />);

      const netCostCell = screen.getByText((content) => content.includes('1.80 USD/L')).closest('td');
      expect(netCostCell).toBeInTheDocument();
      expect(netCostCell?.textContent).toContain('1.80 USD/L');
      expect(netCostCell?.textContent).toContain('2.20 USD/L');
      expect(netCostCell?.textContent).toContain('–');
    });
  });

  describe('spread rendering', () => {
    it('renders single value when low equals high', () => {
      render(<SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaSingleSpreadFixture]} />);

      const spreadCell = screen.getByText('15.0%').closest('td');
      expect(spreadCell).toBeInTheDocument();
      expect(spreadCell?.textContent).toContain('15.0%');
      expect(spreadCell?.textContent).not.toContain('至');
    });

    it('renders range when low differs from high', () => {
      render(<SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaFixture]} />);

      const spreadCell = screen.getByText((content) => content.includes('10.0%')).closest('td');
      expect(spreadCell).toBeInTheDocument();
      expect(spreadCell?.textContent).toContain('10.0%');
      expect(spreadCell?.textContent).toContain('20.0%');
      expect(spreadCell?.textContent).toContain('至');
    });
  });

  it('renders single value for both net cost and spread when both are equal', () => {
    render(<SafPathwayComparisonTable selectedPathwayKey="hefa" pathways={[hefaSingleBothFixture]} />);

    const netCostCell = screen.getByText('1.49 USD/L').closest('td');
    const spreadCell = screen.getByText('15.0%').closest('td');
    expect(netCostCell?.textContent).not.toContain('–');
    expect(spreadCell?.textContent).not.toContain('至');
  });
});
