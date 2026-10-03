import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';
import { assumed, observed } from '@/lib/figure';
import { esgSafJetReference } from '@/lib/esg-saf-economics';
import { toPathwayCostRow } from '@/lib/pathways-read-model';

const mockedReplace = vi.fn();
const mockedSearchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockedReplace
  }),
  useSearchParams: () => mockedSearchParams.value
}));

const testLiveDefaults = {
  fossilJetUsdPerL: assumed({
    value: 1.2,
    unit: 'USD/L',
    sourceId: 'test',
    method: 'test fixture fossil jet',
    precision: 2
  }),
  carbonPriceEurPerT: assumed({
    value: 80,
    unit: 'EUR/t',
    sourceId: 'test',
    method: 'test fixture carbon',
    precision: 2
  }),
  subsidyUsdPerL: assumed({
    value: 0.2,
    unit: 'USD/L',
    sourceId: 'test',
    method: 'test fixture subsidy',
    precision: 2
  }),
  blendRatePct: assumed({
    value: 2,
    unit: '%',
    sourceId: 'test',
    method: 'test fixture blend',
    precision: 2
  }),
  reserveWeeks: assumed({
    value: 3,
    unit: 'weeks',
    sourceId: 'test',
    method: 'test fixture reserve',
    precision: 1
  }),
  pathwayKey: 'hefa'
};

const testReserve = assumed({
  value: 3,
  unit: 'weeks',
  sourceId: 'test',
  method: 'test fixture initial reserve',
  precision: 1
});

describe('TippingPointWorkbench', () => {
  beforeEach(() => {
    mockedReplace.mockClear();
    mockedSearchParams.value = new URLSearchParams();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('keeps external project pricing on the market reference when fuel and airline policy controls change', () => {
    const reference = esgSafJetReference({
      generated_at: '2026-10-02T00:00:00Z', source_status: { overall: 'live' },
      values: { jet_eu_proxy_usd_per_l: 1.2, usd_per_eur: 1.25 },
      source_details: {
        jet_eu_proxy: { source: 'brent-derived', status: 'estimated', as_of: '2026-09-30T00:00:00Z' },
        ecb: { source: 'ecb', status: 'live', as_of: '2026-10-01T00:00:00Z' }
      }
    });
    render(
      <TippingPointWorkbench
        initialTippingPoint={{
          generatedAt: null, effectiveFossilJetUsdPerL: 1.2, signal: 'fossil_still_advantaged',
          inputs: { fossilJetUsdPerL: 1.2, carbonPriceEurPerT: 80, subsidyUsdPerL: 0.2, blendRatePct: 2 },
          pathways: [toPathwayCostRow({
            pathway_key: 'hefa', display_name: 'HEFA', net_cost_low_usd_per_l: 1.8,
            net_cost_high_usd_per_l: 2.2, spread_low_pct: 10, spread_high_pct: 20, status: 'premium'
          }, { asOf: null, basis: 'assumption', method: 'test fixture' })]
        }}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
        projectJetReference={reference}
      />
    );
    const href = 'https://esg.meichen.beauty/saf?preset=HEFA_EU&jet_fuel_price_eur_per_litre=0.9600';
    expect(screen.getByRole('link', { name: /HEFA · 项目经济性/ })).toHaveAttribute('href', href);
    fireEvent.change(screen.getByLabelText(/化石航油/), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText(/ETS SAF 配额/), { target: { value: 'statutory' } });
    fireEvent.change(screen.getByLabelText(/补贴/), { target: { value: '0.8' } });
    expect(screen.getByRole('link', { name: /HEFA · 项目经济性/ })).toHaveAttribute('href', href);
  });

  it('masks the admin token input and disables browser helpers', () => {
    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    const tokenInput = screen.getByLabelText(/管理令牌/) as HTMLInputElement;

    expect(tokenInput.type).toBe('password');
    expect(tokenInput).toHaveAttribute('autocomplete', 'off');
    expect(tokenInput).toHaveAttribute('spellcheck', 'false');
  });

  it('parses valid query parameters on load', () => {
    mockedSearchParams.value = new URLSearchParams({
      fuel: '2.50',
      carbon: '120',
      subsidy: '0.50',
      blend: '10',
      reserve: '5.0',
      pathway: 'ptl'
    });

    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    expect(screen.getByLabelText(/化石航油/).getAttribute('value')).toBe('2.5');
    expect(screen.getByLabelText(/碳价/).getAttribute('value')).toBe('120');
    expect(screen.getByLabelText(/补贴/).getAttribute('value')).toBe('0.5');
    expect(screen.getByLabelText(/掺混比例/).getAttribute('value')).toBe('10');
    expect(screen.getByLabelText(/储备周数/).getAttribute('value')).toBe('5');
    expect((screen.getByLabelText(/已选路径/) as HTMLSelectElement).value).toBe('ptl');
  });

  it('labels a URL fuel input as the user assumption without an observation time', () => {
    mockedSearchParams.value = new URLSearchParams({ fuel: '2.0' });

    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={{
          ...testLiveDefaults,
          fossilJetUsdPerL: observed({
            value: 1.2,
            unit: 'USD/L',
            sourceId: 'test-live-fuel',
            asOf: '2026-09-23T08:00:00Z',
            precision: 2
          })
        }}
      />
    );

    expect(screen.getAllByText('2.00 USD/L')).toHaveLength(2);
    expect(screen.getAllByTestId('figure-basis-assumption').some((mark) => mark.title === '你的输入（假设值）')).toBe(true);
    expect(document.querySelector('time')).toBeNull();
  });

  it('preserves an untouched live fuel quote as observed', () => {
    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={{
          ...testLiveDefaults,
          fossilJetUsdPerL: observed({
            value: 1.2,
            unit: 'USD/L',
            sourceId: 'test-live-fuel',
            asOf: '2026-09-23T08:00:00Z',
            precision: 2
          })
        }}
      />
    );

    expect(screen.getAllByText('1.20 USD/L')).toHaveLength(2);
    expect(screen.getAllByTestId('figure-basis-observed')).toHaveLength(1);
  });

  it('ignores out-of-bounds or non-numeric query parameters, using live defaults instead', () => {
    mockedSearchParams.value = new URLSearchParams({
      fuel: '-1', // min 0.1
      carbon: 'abc', // NaN
      subsidy: '-5', // min 0
      blend: '150', // max 100
      reserve: '0', // min 0.1
      pathway: 'invalid-pathway'
    });

    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    expect(screen.getByLabelText(/化石航油/).getAttribute('value')).toBe('1.2');
    expect(screen.getByLabelText(/碳价/).getAttribute('value')).toBe('80');
    expect(screen.getByLabelText(/补贴/).getAttribute('value')).toBe('0.2');
    expect(screen.getByLabelText(/掺混比例/).getAttribute('value')).toBe('2');
    expect(screen.getByLabelText(/储备周数/).getAttribute('value')).toBe('3');
    expect((screen.getByLabelText(/已选路径/) as HTMLSelectElement).value).toBe('hefa');
  });

  it('writes state changes back to URL query with debounce', async () => {
    vi.useFakeTimers();

    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    const fuelInput = screen.getByLabelText(/化石航油/);
    await act(async () => {
      fireEvent.change(fuelInput, { target: { value: '1.5' } });
    });

    // Debounce is 300ms
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockedReplace).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(mockedReplace).toHaveBeenCalled();

    const callArgs = mockedReplace.mock.calls[0];
    expect(callArgs[0]).toContain('fuel=1.500');
    expect(callArgs[1]).toEqual({ scroll: false });

    vi.useRealTimers();
  });

  it('carries the ETS SAF allowance toggle into the URL and the analysis request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    mockedSearchParams.value = new URLSearchParams({ allowance: 'statutory' });

    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    const select = screen.getByLabelText(/ETS SAF 配额/) as HTMLSelectElement;
    expect(select.value).toBe('statutory');
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(mockedReplace.mock.calls[0][0]).toContain('allowance=statutory');
    const analysisCall = fetchMock.mock.calls.map((call) => String(call[0])).find((url) => url.startsWith('/api/analysis/tipping-point'));
    expect(analysisCall).toContain('saf_allowance=statutory');

    await act(async () => {
      fireEvent.change(select, { target: { value: 'none' } });
      vi.advanceTimersByTime(400);
    });
    expect(mockedReplace.mock.calls.at(-1)?.[0]).not.toContain('allowance=');

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('falls back to no allowance for an unknown allowance parameter', () => {
    mockedSearchParams.value = new URLSearchParams({ allowance: 'everything' });

    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    expect((screen.getByLabelText(/ETS SAF 配额/) as HTMLSelectElement).value).toBe('none');
  });

  it('shows the HEFA market check with the allowance deduction', () => {
    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialMarketCheck={{
          reference_id: 'easa-refueleu-atr-2026-avg-2025',
          kind: 'realized_average',
          region: 'EU',
          period: '2025',
          published_at: '2026-09-17',
          source_name: 'EASA ReFuelEU Aviation Annual Technical Report 2026',
          source_url: 'https://example.test',
          pathway_key: 'hefa',
          saf_eur_per_t: 1925,
          saf_usd_per_l: 1.761,
          fossil_with_ets_usd_per_l: 1.292,
          premium_pct: 18.15,
          status: 'premium',
          allowance_coverage_pct: 50,
          allowance_support_usd_per_l: 0.2346
        }}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    expect(screen.getByText(/HEFA 采购参考价 1\.761 USD\/L/).textContent).toContain('扣除 ETS 配额补贴 0.235 USD/L（剩余价差的 50%）');
  });
});
