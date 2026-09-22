'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard } from '@/components/cards';
import { Panel } from '@/components/panel';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { SignalRow } from '@/components/page-template';
import { SourceFooter } from '@/components/source-footer';
import {
  AviationCostError,
  computeCostChange,
  computeMarketLinkedFlightCost,
  energyTaxEurPerTFromEurPerL,
  kgToMetricTons,
  PRIVATE_JET_ENERGY_TAX_EUR_PER_L_ASSUMPTION
} from '@/lib/aviation-cost';
import type { GermanyJetFuelCopy } from '@/lib/germany-jet-fuel-copy';
import {
  buildGermanyJetFuelReadModelFromPayload,
  decisionFromChange,
  type GermanyDecisionKind,
  type GermanyJetFuelReadModel
} from '@/lib/germany-jet-fuel-read-model';
import type { DisplayLocale, MarketHistory, MarketSnapshot } from '@/lib/product-read-model';
import {
  buildPriceTrendChartReadModelFromHistory,
  type PriceTrendChartReadModel
} from '@/lib/price-trend-chart-read-model';

export type { GermanyJetFuelCopy };

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

function formatMoney(value: number | null, unit: string): string { // figure-contract-lint-ignore: display helper
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(value >= 100 ? 0 : 2)} ${unit}`;
}

function selectedJetMetric(readModel: GermanyJetFuelReadModel) {
  return (
    readModel.metrics.find((metric) => metric.metricKey === readModel.selectedJetMetricKey) ??
    readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l') ??
    null
  );
}

function displayedDecision(readModel: GermanyJetFuelReadModel): GermanyDecisionKind {
  if (readModel.decision) return readModel.decision;
  const selected = selectedJetMetric(readModel);
  return decisionFromChange(
    selected?.changePct30d ?? null,
    selected?.quality || 'unknown',
    readModel.isFallback
  );
}

const EMPTY_CHART: PriceTrendChartReadModel = {
  metrics: {},
  generatedAt: null,
  isFallback: true,
  error: null
};

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function GermanyJetFuelMonitor({
  locale,
  copy,
  initialReadModel,
  initialChart,
  pageDecision,
  showChart = true,
  showFooter = true
}: {
  locale: DisplayLocale;
  copy: GermanyJetFuelCopy;
  initialReadModel: GermanyJetFuelReadModel;
  initialChart: PriceTrendChartReadModel | null;
  pageDecision?: {
    hold: string;
    review: string;
    revisit: string;
    insufficient: string;
  };
  showChart?: boolean;
  showFooter?: boolean;
}) {
  const [readModel, setReadModel] = useState(initialReadModel);
  const [chart, setChart] = useState(initialChart ?? EMPTY_CHART);
  const [pollError, setPollError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<(typeof ROUTE_PRESETS)[number]['id']>('fra-jfk');
  const [fuelKg, setFuelKg] = useState(70000);
  const [passengers, setPassengers] = useState(280);
  const [blendPct, setBlendPct] = useState(0);
  const [safUsdPerL, setSafUsdPerL] = useState('');
  const [airportDiff, setAirportDiff] = useState('');
  const [taxUse, setTaxUse] = useState<'commercial' | 'private'>('commercial');
  const delayRef = useRef(60_000);
  const initialSelected = selectedJetMetric(initialReadModel);
  const baselineRef = useRef({
    fossilJetUsdPerL: initialSelected?.value ?? null,
    usdPerEur: initialReadModel.usdPerEur,
    euaEurPerT: initialReadModel.euaEurPerT,
    quality: initialSelected?.quality ?? 'missing'
  });

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
      const nextController = new AbortController();
      const timeout = window.setTimeout(() => nextController.abort(), 15_000);
      try {
        const [snapshot, history] = await Promise.all([
          fetchJson<MarketSnapshot>('/api/market', nextController.signal),
          fetchJson<MarketHistory>('/api/market/history?window_days=90', nextController.signal)
        ]);
        if (cancelled) return;
        setReadModel(buildGermanyJetFuelReadModelFromPayload(snapshot, history, locale));
        setChart(buildPriceTrendChartReadModelFromHistory(history));
        setPollError(null);
        delayRef.current = 60_000;
      } catch (error) {
        if (cancelled) return;
        setPollError(error instanceof Error ? error.message : 'refresh failed');
        delayRef.current = Math.min(delayRef.current * 2, 10 * 60_000);
      } finally {
        window.clearTimeout(timeout);
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

  const selectedJet = selectedJetMetric(readModel);
  const decision = displayedDecision(readModel);
  const decisionText = pageDecision
    ? decision === 'stable'
      ? pageDecision.hold
      : decision === 'review'
        ? pageDecision.review
        : decision === 'revisit'
          ? pageDecision.revisit
          : pageDecision.insufficient
    : copy.decisions[decision];
  const signalMetrics = readModel.metrics.filter((metric) => metric.metricKey !== selectedJet?.metricKey).slice(0, 3);
  const airportQuote = airportDiff.trim() !== '' && Number.isFinite(Number(airportDiff));
  const parsedSaf = safUsdPerL.trim() === '' ? null : Number(safUsdPerL);
  const taxEurPerT =
    taxUse === 'private' ? energyTaxEurPerTFromEurPerL(PRIVATE_JET_ENERGY_TAX_EUR_PER_L_ASSUMPTION) : 0;

  const cost = useMemo(() => {
    if (!selectedJet?.value || !readModel.usdPerEur || !readModel.selectedJetUsable) {
      return { result: null as ReturnType<typeof computeMarketLinkedFlightCost> | null, error: null as string | null };
    }
    try {
      const result = computeMarketLinkedFlightCost({
        fossilJetUsdPerL: selectedJet.value,
        usdPerEur: readModel.usdPerEur,
        fuelBurnT: kgToMetricTons(fuelKg),
        passengers,
        blendShare: blendPct / 100,
        safUsdPerL: parsedSaf,
        airportDiffEurPerT: airportQuote ? Number(airportDiff) : 0,
        applicableTaxEurPerT: taxEurPerT,
        euaEurPerT: readModel.euaEurPerT,
        etsApplicable: true,
        airportQuoteAvailable: airportQuote,
        quality: selectedJet.quality
      });
      return { result, error: result.missingInputs.length ? result.missingInputs.join(',') : null };
    } catch (error) {
      return {
        result: null,
        error: error instanceof AviationCostError ? error.message : copy.invalidInput
      };
    }
  }, [
    airportDiff,
    airportQuote,
    blendPct,
    copy.invalidInput,
    fuelKg,
    parsedSaf,
    passengers,
    readModel.euaEurPerT,
    readModel.selectedJetUsable,
    readModel.usdPerEur,
    selectedJet,
    taxEurPerT
  ]);

  const delta = useMemo(() => {
    const baselineJet = baselineRef.current.fossilJetUsdPerL;
    const baselineFx = baselineRef.current.usdPerEur;
    if (
      !cost.result?.computable ||
      baselineJet == null ||
      baselineFx == null ||
      !selectedJet?.value ||
      !readModel.usdPerEur
    ) {
      return null;
    }
    try {
      return computeCostChange(
        {
          fossilJetUsdPerL: baselineJet,
          usdPerEur: baselineFx,
          euaEurPerT: baselineRef.current.euaEurPerT,
          fuelBurnT: kgToMetricTons(fuelKg),
          passengers,
          blendShare: blendPct / 100,
          safUsdPerL: parsedSaf,
          airportDiffEurPerT: airportQuote ? Number(airportDiff) : 0,
          applicableTaxEurPerT: taxEurPerT,
          quality: baselineRef.current.quality,
          etsApplicable: true
        },
        {
          fossilJetUsdPerL: selectedJet.value,
          usdPerEur: readModel.usdPerEur,
          euaEurPerT: readModel.euaEurPerT,
          fuelBurnT: kgToMetricTons(fuelKg),
          passengers,
          blendShare: blendPct / 100,
          safUsdPerL: parsedSaf,
          airportDiffEurPerT: airportQuote ? Number(airportDiff) : 0,
          applicableTaxEurPerT: taxEurPerT,
          quality: selectedJet.quality,
          etsApplicable: true
        }
      );
    } catch {
      return null;
    }
  }, [
    airportDiff,
    airportQuote,
    blendPct,
    cost.result,
    fuelKg,
    parsedSaf,
    passengers,
    readModel.euaEurPerT,
    readModel.usdPerEur,
    selectedJet,
    taxEurPerT
  ]);

  const asOf = readModel.isFallback ? null : (readModel.quoteAsOf ?? readModel.generatedAt);

  return (
    <>
      <p className="mb-4 text-xs text-subtle" data-testid="quote-and-fetch">
        <span className="uppercase tracking-[0.18em]">{copy.quoteDate}</span>{' '}
        <time className="tabular-nums" data-testid="selected-quote-date">
          {readModel.quoteAsOf ?? 'n/a'}
        </time>
        {' · '}
        <span className="uppercase tracking-[0.18em]">{copy.lastCheck}</span>{' '}
        <time className="tabular-nums">{readModel.fetchedAt ?? 'n/a'}</time>
        {pollError ? (
          <span className="ml-2 text-warning" data-testid="poll-error">
            {copy.staleKeep}
          </span>
        ) : null}
      </p>

      <SignalRow label={copy.signalLabel}>
        <div data-testid="selected-jet-signal">
          <MetricCard
            label={copy.decisionLabel}
            value={decisionText}
            valueClassName={decisionTone(decision)}
            hint={
              selectedJet
                ? `${selectedJet.label} ${formatMetricValue(selectedJet.value, selectedJet.digits, selectedJet.unit, locale)} · 30d ${formatChange(selectedJet.changePct30d, copy.historyMissing)}${selectedJet.quality ? ` · ${selectedJet.quality}` : ''}`
                : copy.historyMissing
            }
          />
        </div>
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
              step={1}
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
            {copy.safPriceLabel}
            <input
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              type="number"
              min={0}
              value={safUsdPerL}
              placeholder="n/a"
              onChange={(event) => setSafUsdPerL(event.target.value)}
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
              {formatMoney(cost.result?.deliveredEurPerT ?? null, 'EUR/t')}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.fuelOnly}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="fuel-cost-eur">
              {formatMoney(cost.result?.fuelCostEur ?? null, 'EUR')}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.carbonOnly}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="carbon-cost-eur">
              {formatMoney(cost.result?.carbonCostEur ?? null, 'EUR')}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.perFlight}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="fuel-compliance-eur">
              {formatMoney(cost.result?.fuelAndComplianceEur ?? null, 'EUR')}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-subtle">{copy.perPax}</dt>
            <dd className="js-metric-value tabular-nums" data-testid="cost-per-pax">
              {formatMoney(cost.result?.perPassengerEur ?? null, 'EUR')}
            </dd>
          </div>
        </dl>
        {taxUse === 'private' ? <p className="mt-3 text-sm text-warning">{copy.taxAssumption}</p> : null}
        {!airportQuote ? <p className="mt-3 text-sm text-warning">{copy.noAirportQuote}</p> : null}
        {cost.error?.includes('saf') || cost.result?.missingInputs.includes('saf_usd_per_l') ? (
          <p className="mt-3 text-sm text-danger" data-testid="missing-saf">
            {copy.missingSaf}
          </p>
        ) : null}
        {cost.result?.missingInputs.includes('eua_eur_per_t') ? (
          <p className="mt-3 text-sm text-warning" data-testid="missing-carbon">
            {copy.missingCarbon}
          </p>
        ) : null}
        {cost.error && !cost.result ? (
          <p className="mt-3 text-sm text-danger" data-testid="invalid-cost-input">
            {copy.invalidInput}
          </p>
        ) : null}
        {delta?.fuelAndComplianceDeltaEur != null ? (
          <div className="mt-6 border-t border-line pt-4" data-testid="cost-change">
            <p className="text-sm font-medium text-ink">{copy.costChangeTitle}</p>
            <p className="mt-2 text-sm text-muted">
              {copy.deltaFlight}: {delta.fuelAndComplianceDeltaEur.toFixed(0)} EUR · {copy.deltaPax}:{' '}
              {delta.perPassengerDeltaEur?.toFixed(2)} EUR
            </p>
          </div>
        ) : null}
      </Panel>

      {showChart ? (
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
      ) : null}

      {showFooter ? (
      <SourceFooter
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? locale === 'en'
                ? `Germany jet-fuel read model unavailable (${readModel.error ?? 'unknown'})`
                : locale === 'de'
                  ? `Deutschland-Jet-Read-Model nicht verfügbar (${readModel.error ?? 'unbekannt'})`
                  : `德国航油价格读模型不可用，当前为回退估算（${readModel.error ?? '未知原因'}）`
              : locale === 'en'
                ? 'Germany jet-fuel read model (Brent, global jet, EU jet, carbon)'
                : locale === 'de'
                  ? 'Deutschland-Jet-Read-Model (Brent, globales Jet, EU-Jet, Carbon)'
                  : '德国航油价格读模型（Brent、全球航油、EU 航油代理与碳价代理）',
            asOf,
            basis: readModel.isFallback ? 'assumption' : ('derived' as const)
          },
          ...copy.sourceLinks.map((source) => ({
            id: source.key,
            label: source.label,
            href: source.href,
            asOf: readModel.isFallback
              ? null
              : readModel.metrics.find((metric) => metric.metricKey === source.key)?.observedAt ?? null,
            basis: readModel.isFallback ? ('assumption' as const) : ('derived' as const)
          })),
          {
            id: 'price-trend-read-model',
            label: chart.isFallback
              ? locale === 'en'
                ? `Price trend history unavailable (${chart.error ?? 'unknown'})`
                : locale === 'de'
                  ? `Preistrend nicht verfügbar (${chart.error ?? 'unbekannt'})`
                  : `价格趋势历史不可用（${chart.error ?? '未知原因'}）`
              : locale === 'en'
                ? 'Price trend history (1d, 7d, 30d)'
                : locale === 'de'
                  ? 'Preistrendhistorie (1d, 7d, 30d)'
                  : '价格趋势历史读模型（1d、7d、30d 窗口）',
            asOf: chart.isFallback ? null : chart.generatedAt,
            basis: chart.isFallback ? ('assumption' as const) : ('derived' as const)
          }
        ]}
        methodHref="/sources"
        methodLabel={copy.methodLabel}
        limitations={copy.limitations}
        locale={locale}
      />
      ) : null}
    </>
  );
}
