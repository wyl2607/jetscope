import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GermanyJetFuelMonitor } from '@/components/germany-jet-fuel-monitor';
import { germanyJetFuelCopy } from '@/lib/germany-jet-fuel-copy';
import {
  buildGermanyJetFuelReadModelFromPayload,
  type GermanyJetFuelReadModel
} from '@/lib/germany-jet-fuel-read-model';
import { computeMarketLinkedFlightCost, kgToMetricTons } from '@/lib/aviation-cost';
import { buildPriceTrendChartReadModelFromHistory } from '@/lib/price-trend-chart-read-model';
import type { PriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';

const copy = germanyJetFuelCopy.en;

function metric(value: number, quality = 'derived'): GermanyJetFuelReadModel['metrics'][number] {
  return {
    metricKey: 'jet_eu_proxy_usd_per_l',
    label: 'EU jet',
    unit: 'USD/L',
    value,
    digits: 3,
    sourceMetricKey: 'jet_eu_proxy_usd_per_l',
    latestAsOf: '2026-09-10T00:00:00Z',
    observedAt: '2026-09-10T00:00:00Z',
    fetchedAt: '2026-09-14T09:00:00Z',
    changePct1d: null,
    changePct7d: null,
    changePct30d: 4,
    quality,
    quoteKind: 'proxy',
    note: null
  };
}

function readModel(value: number): GermanyJetFuelReadModel {
  const jet = metric(value);
  return {
    generatedAt: '2026-09-10T00:00:00Z',
    fetchedAt: '2026-09-14T09:00:00Z',
    quoteAsOf: '2026-09-10T00:00:00Z',
    overallStatus: 'degraded',
    metrics: [jet],
    isFallback: false,
    decision: 'stable',
    usdPerEur: 1.25,
    usdPerEurQuality: 'observed',
    euaEurPerT: 80,
    euaQuality: 'observed',
    selectedJetMetricKey: 'jet_eu_proxy_usd_per_l',
    selectedJetUsable: true,
    germanyPremiumPct: null,
    germanyPremiumNote: null,
    error: null
  };
}

function chart(value: number): PriceTrendChartReadModel {
  return buildPriceTrendChartReadModelFromHistory({
    metrics: {
      jet_eu_proxy_usd_per_l: {
        metric_key: 'jet_eu_proxy_usd_per_l',
        unit: 'USD/L',
        latest_value: value,
        latest_as_of: '2026-09-10T00:00:00Z',
        change_pct_1d: null,
        change_pct_7d: null,
        change_pct_30d: 4,
        quality: 'derived',
        points: [{ as_of: '2026-09-10T00:00:00Z', value, quality: 'derived', source: 'brent-derived' }]
      }
    }
  });
}

describe('GermanyJetFuelMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('updates the trend chart after a successful poll', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (path: string) => {
      const next = String(path).includes('history')
        ? {
            generated_at: '2026-09-11T00:00:00Z',
            metrics: {
              jet_eu_proxy_usd_per_l: {
                metric_key: 'jet_eu_proxy_usd_per_l',
                unit: 'USD/L',
                latest_value: 0.91,
                latest_as_of: '2026-09-11T00:00:00Z',
                quality: 'derived',
                points: [{ as_of: '2026-09-11T00:00:00Z', value: 0.91, quality: 'derived' }]
              }
            }
          }
        : {
            generated_at: '2026-09-11T00:00:00Z',
            fetched_at: '2026-09-14T10:00:00Z',
            source_status: { overall: 'degraded', is_fallback: false },
            values: {
              jet_eu_proxy_usd_per_l: 0.91,
              usd_per_eur: 1.25,
              eu_ets_price_eur_per_t: 80
            },
            source_details: {
              jet_eu_proxy: { source: 'brent-derived', status: 'fallback', quality: 'derived', fallback_used: true },
              ecb: { source: 'ecb', status: 'ok', quality: 'observed' },
              eu_ets: { source: 'eex-eu-ets', status: 'ok', quality: 'observed' }
            }
          };
      return { ok: true, json: async () => next };
    });

    render(
      <GermanyJetFuelMonitor
        locale="en"
        copy={copy}
        initialReadModel={readModel(0.8)}
        initialChart={chart(0.8)}
      />
    );

    expect(screen.getByTestId('price-trend-latest')).toHaveTextContent('0.80');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByTestId('price-trend-latest')).toHaveTextContent('0.91');
  });

  it('does not compute a 200% blend as a negative carbon cost', () => {
    render(
      <GermanyJetFuelMonitor
        locale="en"
        copy={copy}
        initialReadModel={readModel(1)}
        initialChart={chart(1)}
      />
    );
    const blend = screen.getByLabelText(copy.blendLabel);
    fireEvent.change(blend, { target: { value: '200' } });
    expect(screen.getByTestId('fuel-compliance-eur')).toHaveTextContent('n/a');
    expect(screen.getByTestId('invalid-cost-input')).toBeInTheDocument();
  });

  it('uses the Rotterdam quote throughout when it differs from the EU proxy', () => {
    const market = {
      generated_at: '2026-09-14T09:00:00Z',
      fetched_at: '2026-09-14T09:00:00Z',
      source_status: { overall: 'ok', is_fallback: false },
      values: {
        brent_usd_per_bbl: 87.01,
        jet_usd_per_l: 0.64,
        jet_eu_proxy_usd_per_l: 1.2,
        rotterdam_jet_fuel_usd_per_l: 0.88,
        carbon_proxy_usd_per_t: 91.91,
        usd_per_eur: 1.25,
        eu_ets_price_eur_per_t: 80
      },
      source_details: {
        rotterdam_jet_fuel: {
          source: 'rotterdam-jet-direct',
          status: 'ok',
          quality: 'observed',
          observed_at: '2026-09-10T00:00:00Z',
          fetched_at: '2026-09-14T09:00:00Z',
          lag_minutes: 1440
        },
        jet_eu_proxy: {
          source: 'brent-derived',
          status: 'fallback',
          fallback_used: true,
          quality: 'derived',
          observed_at: '2026-09-13T00:00:00Z',
          fetched_at: '2026-09-14T09:00:00Z',
          lag_minutes: 1440
        },
        ecb: { source: 'ecb', status: 'ok', quality: 'observed', observed_at: '2026-09-14T00:00:00Z' },
        eu_ets: { source: 'eex-eu-ets', status: 'ok', quality: 'observed', observed_at: '2026-09-14T00:00:00Z' }
      }
    };
    const history = {
      metrics: {
        rotterdam_jet_fuel_usd_per_l: {
          metric_key: 'rotterdam_jet_fuel_usd_per_l',
          unit: 'USD/L',
          latest_value: 0.88,
          latest_as_of: '2026-09-10T00:00:00Z',
          change_pct_30d: 4,
          quality: 'observed',
          points: [{ as_of: '2026-09-10T00:00:00Z', value: 0.88, quality: 'observed' }]
        },
        jet_eu_proxy_usd_per_l: {
          metric_key: 'jet_eu_proxy_usd_per_l',
          unit: 'USD/L',
          latest_value: 1.2,
          latest_as_of: '2026-09-13T00:00:00Z',
          change_pct_30d: 18,
          quality: 'derived',
          points: [{ as_of: '2026-09-13T00:00:00Z', value: 1.2, quality: 'derived' }]
        }
      }
    };
    const readModel = buildGermanyJetFuelReadModelFromPayload(market, history, 'en');
    const expectedCost = computeMarketLinkedFlightCost({
      fossilJetUsdPerL: 0.88,
      usdPerEur: 1.25,
      fuelBurnT: kgToMetricTons(70000),
      passengers: 280,
      euaEurPerT: 80,
      etsApplicable: true,
      quality: 'observed'
    });
    const euProxyCost = computeMarketLinkedFlightCost({
      fossilJetUsdPerL: 1.2,
      usdPerEur: 1.25,
      fuelBurnT: kgToMetricTons(70000),
      passengers: 280,
      euaEurPerT: 80,
      etsApplicable: true,
      quality: 'derived'
    });

    render(
      <GermanyJetFuelMonitor
        locale="en"
        copy={copy}
        initialReadModel={readModel}
        initialChart={buildPriceTrendChartReadModelFromHistory(history)}
      />
    );

    expect(readModel.selectedJetMetricKey).toBe('rotterdam_jet_fuel_usd_per_l');
    expect(0.88).not.toBe(1.2);
    const signal = screen.getByTestId('selected-jet-signal');
    expect(signal).toHaveTextContent('0.880');
    expect(signal).not.toHaveTextContent('1.200');
    expect(signal).toHaveTextContent('observed');
    expect(screen.getByTestId('selected-quote-date')).toHaveTextContent('2026-09-10T00:00:00Z');
    expect(screen.getByTestId('selected-quote-date')).not.toHaveTextContent('2026-09-13T00:00:00Z');
    expect(screen.getByText(copy.decisions.stable)).toBeInTheDocument();
    expect(screen.queryByText(copy.decisions.review)).not.toBeInTheDocument();
    expect(screen.getByTestId('fuel-cost-eur')).toHaveTextContent(
      `${expectedCost.fuelCostEur?.toFixed(0)} EUR`
    );
    expect(screen.getByTestId('fuel-cost-eur')).not.toHaveTextContent(
      `${euProxyCost.fuelCostEur?.toFixed(0)} EUR`
    );
  });
});
