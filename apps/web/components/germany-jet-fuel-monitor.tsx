'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard } from '@/components/cards';
import { Panel } from '@/components/panel';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { SignalRow } from '@/components/page-template';
import {
  computeMarketLinkedFlightCost,
  kgToMetricTons
} from '@/lib/aviation-cost';
import {
  buildGermanyJetFuelReadModelFromPayload,
  type GermanyDecisionKind,
  type GermanyJetFuelReadModel
} from '@/lib/germany-jet-fuel-read-model';
import type { DisplayLocale, MarketHistory, MarketSnapshot } from '@/lib/product-read-model';
import type { PriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';

export type GermanyJetFuelCopy = {
  signalLabel: string;
  decisionLabel: string;
  decisions: Record<GermanyDecisionKind, string>;
  historyMissing: string;
  quoteDate: string;
  lastCheck: string;
  staleKeep: string;
  costTitle: string;
  costWhy: string;
  estimateBanner: string;
  airportLabel: string;
  fuelKgLabel: string;
  paxLabel: string;
  blendLabel: string;
  airportDiffLabel: string;
  taxUseLabel: string;
  taxCommercial: string;
  taxPrivate: string;
  perFlight: string;
  perPax: string;
  delivered: string;
  noAirportQuote: string;
  methodLabel: string;
  limitations: string[];
};

const ROUTE_PRESETS = [
  { id: 'fra-jfk', label: 'FRA–JFK A350', airport: 'FRA', fuelKg: 70000, pax: 280 },
  { id: 'muc-pek', label: 'MUC–PEK A350', airport: 'MUC', fuelKg: 75000, pax: 280 },
  { id: 'ber-lhr', label: 'BER–LHR A320', airport: 'BER', fuelKg: 4500, pax: 150 }
] as const;

function formatMetricValue(
  value: number | null, // figure-contract-lint-ignore: display helper, provenance lives on the metric
  digits: number, // figure-contract-lint-ignore: display digits, not a measurement
  unit: string,
  locale: DisplayLocale
): string {
  if (!Number.isFinite(value ?? NaN)) return `n/a ${unit}`;
  const tag = locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-US';
  return `${Number(value).toLocaleString(tag, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} ${unit}`;
}

function formatChange(value: number | null, missing: string): string { // figure-contract-lint-ignore: display helper
  if (!Number.isFinite(value ?? NaN)) return missing;
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function changeClass(value: number | null): string { // figure-contract-lint-ignore: display helper
  if (!Number.isFinite(value ?? NaN)) return 'text-warning';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
}

function decisionTone(kind: GermanyDecisionKind): string {
  if (kind === 'insufficient' || kind === 'revisit') return 'text-danger';
  if (kind === 'review') return 'text-warning';
  return 'text-success';
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function GermanyJetFuelMonitor({
  locale,
  copy,
  initialReadModel,
  initialChart
}: {
  locale: DisplayLocale;
  copy: GermanyJetFuelCopy;
  initialReadModel: GermanyJetFuelReadModel;
  initialChart: PriceTrendChartReadModel;
}) {
  const [readModel, setReadModel] = useState(initialReadModel);
  const [chart, setChart] = useState(initialChart);
  const [pollError, setPollError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<(typeof ROUTE_PRESETS)[number]['id']>('fra-jfk');
  const [fuelKg, setFuelKg] = useState(70000);
  const [passengers, setPassengers] = useState(280);
  const [blendPct, setBlendPct] = useState(2);
  const [airportDiff, setAirportDiff] = useState('');
  const [taxUse, setTaxUse] = useState<'commercial' | 'private'>('commercial');
  const delayRef = useRef(60_000);

  useEffect(() => {
    const preset = ROUTE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setFuelKg(preset.fuelKg);
    setPassengers(preset.pax);
  }, [presetId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const [snapshot, history] = await Promise.all([
          fetchJson<MarketSnapshot>('/api/market'),
          fetchJson<MarketHistory>('/api/market/history?window_days=90')
        ]);
        if (cancelled) return;
        setReadModel(buildGermanyJetFuelReadModelFromPayload(snapshot, history, locale));
        setPollError(null);
        delayRef.current = 60_000;
      } catch (error) {
        if (cancelled) return;
        setPollError(error instanceof Error ? error.message : 'refresh failed');
        delayRef.current = Math.min(delayRef.current * 2, 10 * 60_000);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, delayRef.current);
        }
      }
    };

    timer = window.setTimeout(poll, delayRef.current);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [locale]);

  const euJet = readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l') ?? readModel.metrics[0];
  const signalMetrics = readModel.metrics.filter((metric) => metric.metricKey !== euJet?.metricKey).slice(0, 3);
  const airportQuote = airportDiff.trim() !== '' && Number.isFinite(Number(airportDiff));
  const cost = useMemo(() => {
    if (!euJet?.value || !readModel.usdPerEur) return null;
    try {
      return computeMarketLinkedFlightCost({
        fossilJetUsdPerL: euJet.value,
        usdPerEur: readModel.usdPerEur,
        fuelBurnT: kgToMetricTons(fuelKg),
        passengers,
        blendShare: blendPct / 100,
        airportDiffEurPerT: airportQuote ? Number(airportDiff) : 0,
        applicableTaxEurPerT: taxUse === 'private' ? 654.5 : 0,
        euaEurPerT: readModel.euaEurPerT,
        airportQuoteAvailable: airportQuote,
        quality: euJet.quality
      });
    } catch {
      return null;
    }
  }, [airportDiff, airportQuote, blendPct, euJet, fuelKg, passengers, readModel.euaEurPerT, readModel.usdPerEur, taxUse]);

  return (
    <>
      <p className="mb-4 text-xs text-subtle" data-testid="quote-and-fetch">
        <span className="uppercase tracking-[0.18em]">{copy.quoteDate}</span>{' '}
        <time className="tabular-nums">{readModel.quoteAsOf ?? 'n/a'}</time>
        {' · '}
        <span className="uppercase tracking-[0.18em]">{copy.lastCheck}</span>{' '}
        <time className="tabular-nums">{readModel.fetchedAt ?? 'n/a'}</time>
        {pollError ? <span className="ml-2 text-warning">{copy.staleKeep}</span> : null}
      </p>

      <SignalRow label={copy.signalLabel}>
        <MetricCard
          label={copy.decisionLabel}
          value={copy.decisions[readModel.decision]}
          valueClassName={decisionTone(readModel.decision)}
          hint={
            euJet
              ? `EU jet ${formatMetricValue(euJet.value, euJet.digits, euJet.unit, locale)} · 30d ${formatChange(euJet.changePct30d, copy.historyMissing)} · ${euJet.quality}`
              : copy.historyMissing
          }
        />
        {signalMetrics.map((metric) => (
          <MetricCard
            key={metric.metricKey}
            label={metric.label}
            value={formatMetricValue(metric.value, metric.digits, metric.unit, locale)}
            valueClassName={readModel.isFallback ? 'text-warning' : changeClass(metric.changePct30d)}
            hint={`1d ${formatChange(metric.changePct1d, copy.historyMissing)} · 7d ${formatChange(metric.changePct7d, copy.historyMissing)} · 30d ${formatChange(metric.changePct30d, copy.historyMissing)}${metric.note ? ` · ${metric.note}` : ''}`}
          />
        ))}
      </SignalRow>

      <Panel title={copy.costTitle} why={copy.costWhy} locale={locale}>
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="cost-estimate-banner">
          {copy.estimateBanner}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-muted">
            {copy.airportLabel}
            <select
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              value={presetId}
              onChange={(event) => setPresetId(event.target.value as (typeof ROUTE_PRESETS)[number]['id'])}
            >
              {ROUTE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            {copy.fuelKgLabel}
            <input
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              type="number"
              min={1}
              value={fuelKg}
              onChange={(event) => setFuelKg(Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-muted">
            {copy.paxLabel}
            <input
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              type="number"
              min={1}
              value={passengers}
              onChange={(event) => setPassengers(Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-muted">
            {copy.blendLabel}
            <input
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              type="number"
              min={0}
              max={100}
              value={blendPct}
              onChange={(event) => setBlendPct(Number(event.target.value))}
            />
          </label>
          <label className="text-sm text-muted">
            {copy.airportDiffLabel}
            <input
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              type="number"
              value={airportDiff}
              placeholder="n/a"
              onChange={(event) => setAirportDiff(event.target.value)}
            />
          </label>
          <label className="text-sm text-muted">
            {copy.taxUseLabel}
            <select
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              value={taxUse}
              onChange={(event) => setTaxUse(event.target.value as 'commercial' | 'private')}
            >
              <option value="commercial">{copy.taxCommercial}</option>
              <option value="private">{copy.taxPrivate}</option>
            </select>
          </label>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.delivered}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="delivered-eur-per-t">
              {cost ? `${cost.deliveredEurPerT.toFixed(2)} EUR/t` : 'n/a'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.perFlight}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="fuel-compliance-eur">
              {cost ? `${cost.fuelAndComplianceEur.toFixed(0)} EUR` : 'n/a'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.perPax}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="cost-per-pax">
              {cost ? `${cost.perPassengerEur.toFixed(2)} EUR` : 'n/a'}
            </dd>
          </div>
        </dl>
        {!airportQuote ? <p className="mt-3 text-sm text-warning">{copy.noAirportQuote}</p> : null}
      </Panel>

      <Panel
        title={locale === 'de' ? 'Preistrend' : locale === 'en' ? 'Price trend' : '价格趋势'}
        why={
          locale === 'de'
            ? 'Ohne 1d/7d/30d-Fenster ist eine einzelne Zahl kein Entscheidungssignal.'
            : locale === 'en'
              ? 'A single print is not a decision until it sits in a 1d/7d/30d window.'
              : '当前价只是一个点；只有把它放进 1d、7d、30d 窗口，才能判断偏离是否足以触发合同或套保复核。'
        }
        locale={locale}
      >
        <PriceTrendsChart metrics={chart.metrics} isLoading={false} error={chart.error} />
      </Panel>

    </>
  );
}
