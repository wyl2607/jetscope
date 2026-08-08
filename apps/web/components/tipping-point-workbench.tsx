'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { AirlineDecisionMatrix } from '@/components/airline-decision-matrix';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { ScenarioCostStackChart } from '@/components/scenario-cost-stack-chart';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { assumed, derived, observed, type Figure } from '@/lib/figure';
import {
  type AirlineDecisionResponse,
  type DecisionReadModel,
  type TippingPointReadModel,
  type TippingPointResponse,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';

const WORKBENCH_SOURCE_ID = 'saf-tipping-model';

function fossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null
): Figure {
  if (asOf) {
    return observed({
      value,
      unit: 'USD/L',
      sourceId: WORKBENCH_SOURCE_ID,
      asOf,
      precision: 2
    });
  }
  return assumed({
    value,
    unit: 'USD/L',
    sourceId: WORKBENCH_SOURCE_ID,
    precision: 2,
    method: 'workbench fossil-jet input (slider or live default without source timestamp)'
  });
}

function effectiveFossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null
): Figure {
  return derived({
    value,
    unit: 'USD/L',
    sourceId: WORKBENCH_SOURCE_ID,
    asOf,
    precision: 2,
    method:
      'effective fossil jet = spot fossil jet + carbon price pressure at selected blend rate, minus subsidy (tipping-point model)'
  });
}

type Props = {
  initialTippingPoint: TippingPointReadModel | null;
  initialDecision: DecisionReadModel | null;
  initialReserveWeeks: number;
  reserveIsScenarioDefault?: boolean;
  liveDefaults: {
    fossilJetUsdPerL: number;
    carbonPriceEurPerT: number;
    subsidyUsdPerL: number;
    blendRatePct: number;
    reserveWeeks: number;
    pathwayKey: string;
  };
};

const PATHWAY_KEYS = ['hefa', 'atj', 'ft', 'ptl'] as const;

function finiteNumber(value: string | null, fallback: number): number { // figure-contract-lint-ignore: input parsing helper, not a prop
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedNumber(value: string, fallback: number, min: number, max = Number.POSITIVE_INFINITY): number { // figure-contract-lint-ignore: input clamping helper, not a prop
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatNumber(value: number, digits = 2): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return value.toFixed(digits);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.detail ?? body?.error ?? `HTTP ${response.status}`);
  }
  return body as T;
}

export function TippingPointWorkbench({
  initialTippingPoint,
  initialDecision,
  initialReserveWeeks,
  reserveIsScenarioDefault = false,
  liveDefaults
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [fossilJetUsdPerL, setFossilJetUsdPerL] = useState(() =>
    finiteNumber(searchParams.get('fuel'), liveDefaults.fossilJetUsdPerL)
  );
  const [carbonPriceEurPerT, setCarbonPriceEurPerT] = useState(() =>
    finiteNumber(searchParams.get('carbon'), liveDefaults.carbonPriceEurPerT)
  );
  const [subsidyUsdPerL, setSubsidyUsdPerL] = useState(() =>
    finiteNumber(searchParams.get('subsidy'), liveDefaults.subsidyUsdPerL)
  );
  const [blendRatePct, setBlendRatePct] = useState(() =>
    Math.min(100, finiteNumber(searchParams.get('blend'), liveDefaults.blendRatePct))
  );
  const [reserveWeeks, setReserveWeeks] = useState(() =>
    finiteNumber(searchParams.get('reserve'), liveDefaults.reserveWeeks || initialReserveWeeks)
  );
  const [pathwayKey, setPathwayKey] = useState(() => {
    const raw = searchParams.get('pathway') ?? liveDefaults.pathwayKey;
    return PATHWAY_KEYS.includes(raw as (typeof PATHWAY_KEYS)[number]) ? raw : liveDefaults.pathwayKey;
  });
  const [tippingPoint, setTippingPoint] = useState<TippingPointReadModel | null>(initialTippingPoint);
  const [decision, setDecision] = useState<DecisionReadModel | null>(initialDecision);
  const [status, setStatus] = useState('就绪');
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [scenarioName, setScenarioName] = useState('SAF 拐点情景');

  const query = useMemo(() => {
    const params = new URLSearchParams({
      fuel: formatNumber(fossilJetUsdPerL, 3),
      carbon: formatNumber(carbonPriceEurPerT, 2),
      subsidy: formatNumber(subsidyUsdPerL, 3),
      blend: formatNumber(blendRatePct, 2),
      reserve: formatNumber(reserveWeeks, 2),
      pathway: pathwayKey
    });
    return params.toString();
  }, [blendRatePct, carbonPriceEurPerT, fossilJetUsdPerL, pathwayKey, reserveWeeks, subsidyUsdPerL]);

  const pathways = tippingPoint?.pathways ?? [];
  const selectedPathway = pathways.find((item) => item.pathway_key === pathwayKey) ?? pathways[0] ?? null;
  const selectedPathwayKey = selectedPathway?.pathway_key ?? pathwayKey;
  const saveDisabledReason = !adminToken ? '输入管理令牌后可保存情景' : null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      startTransition(() => {
        router.replace(`/crisis/saf-tipping-point?${query}` as Route, { scroll: false });
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query, router, startTransition]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus('正在重新计算分析...');
      setError(null);
      try {
        const analysisParams = new URLSearchParams({
          fossil_jet_usd_per_l: String(fossilJetUsdPerL),
          carbon_price_eur_per_t: String(carbonPriceEurPerT),
          subsidy_usd_per_l: String(subsidyUsdPerL),
          blend_rate_pct: String(blendRatePct)
        });
        const decisionParams = new URLSearchParams({
          fossil_jet_usd_per_l: String(fossilJetUsdPerL),
          reserve_weeks: String(Math.max(0.1, reserveWeeks)),
          carbon_price_eur_per_t: String(carbonPriceEurPerT),
          pathway_key: selectedPathwayKey
        });
        const [nextTippingPoint, nextDecision] = await Promise.all([
          fetch(`/api/analysis/tipping-point?${analysisParams}`, { cache: 'no-store', signal: controller.signal }).then(
            (response) => parseJsonResponse<TippingPointResponse>(response)
          ),
          fetch(`/api/analysis/airline-decision?${decisionParams}`, { cache: 'no-store', signal: controller.signal }).then(
            (response) => parseJsonResponse<AirlineDecisionResponse>(response)
          )
        ]);
        setTippingPoint(toTippingPointReadModel(nextTippingPoint));
        setDecision(toDecisionReadModel(nextDecision));
        setStatus('分析已更新');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('分析服务暂时不可用，当前结果保留为本地情景基线。请确认 API 已启动后再重新计算。');
        setStatus('使用情景基线');
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [blendRatePct, carbonPriceEurPerT, fossilJetUsdPerL, reserveWeeks, selectedPathwayKey, subsidyUsdPerL]);

  function useLiveValues() {
    setFossilJetUsdPerL(liveDefaults.fossilJetUsdPerL);
    setCarbonPriceEurPerT(liveDefaults.carbonPriceEurPerT);
    setSubsidyUsdPerL(liveDefaults.subsidyUsdPerL);
    setBlendRatePct(liveDefaults.blendRatePct);
    setReserveWeeks(liveDefaults.reserveWeeks);
    setPathwayKey(liveDefaults.pathwayKey);
    setStatus('已应用实时市场默认值');
  }

  function handleAdminTokenChange(value: string) {
    setAdminToken(value);
  }

  async function postScenario() {
    const trimmed = scenarioName.trim();
    if (!trimmed) {
      setError('情景名称不能为空');
      return;
    }
    setStatus('正在保存情景...');
    setError(null);
    try {
      // Midpoint is unknown when either band end is null — never launder into 0.
      const low = selectedPathway?.netCostLow.value ?? null;
      const high = selectedPathway?.netCostHigh.value ?? null;
      if (selectedPathway && (low == null || high == null)) {
        setError('所选路径净成本未知，无法写入 baseCostUsdPerLiter。');
        setStatus('保存失败');
        return;
      }
      const payload = {
        name: trimmed,
        preferences: {
          schema_version: 1,
          crudeSource: 'manual',
          carbonSource: 'manual',
          benchmarkMode: 'live-jet-spot',
          carbonPriceUsdPerTonne: Number((carbonPriceEurPerT * 1.1435 /* seed EURUSD aligned market.DEFAULT_EUR_USD 2026-07-17 */).toFixed(2)),
          subsidyUsdPerLiter: subsidyUsdPerL,
          tippingPoint: {
            fossilJetUsdPerL,
            carbonPriceEurPerT,
            blendRatePct,
            reserveWeeks,
            pathwayKey: selectedPathwayKey,
            signal: tippingPoint?.signal ?? 'unknown'
          }
        },
        route_edits:
          selectedPathway && low != null && high != null
            ? {
                [selectedPathway.pathway_key]: {
                  name: selectedPathway.display_name,
                  pathway: selectedPathway.pathway_key,
                  baseCostUsdPerLiter: Number(((low + high) / 2).toFixed(4)),
                  co2SavingsKgPerLiter: 0
                }
              }
            : {}
      };
      const response = await fetch('/api/scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${response.status}`);
      }
      setStatus(`已保存情景“${body.name}”`);
    } catch (err) {
      setError('情景暂时无法保存。请确认管理令牌和 API 服务可用后再试。');
      setStatus('保存失败');
    }
  }

  return (
    <div className="space-y-6 tabular-nums">
      <section>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-2xl text-sm leading-6 text-muted">
            调整市场与政策假设。结果通过现有 FastAPI 分析合约重新计算，URL 会保持可分享。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:bg-accent-soft"
              onClick={useLiveValues}
            >
              使用实时值
            </button>
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs text-muted" aria-live="polite">
              {isPending ? '正在更新 URL...' : status}
            </span>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl border border-warning bg-warning-soft px-3 py-2 text-xs text-warning">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            化石航油 USD/L
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              type="number"
              min="0.1"
              step="0.01"
              value={fossilJetUsdPerL}
              onChange={(event) => setFossilJetUsdPerL((current) => boundedNumber(event.target.value, current, 0.1))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            碳价 EUR/t
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              type="number"
              min="0"
              step="1"
              value={carbonPriceEurPerT}
              onChange={(event) => setCarbonPriceEurPerT((current) => boundedNumber(event.target.value, current, 0))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            补贴 USD/L
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              type="number"
              min="0"
              step="0.01"
              value={subsidyUsdPerL}
              onChange={(event) => setSubsidyUsdPerL((current) => boundedNumber(event.target.value, current, 0))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            掺混比例 %
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              type="number"
              min="0"
              max="100"
              step="1"
              value={blendRatePct}
              onChange={(event) => setBlendRatePct((current) => boundedNumber(event.target.value, current, 0, 100))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            {reserveIsScenarioDefault ? '储备周数（假设）' : '储备周数'}
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              type="number"
              min="0.1"
              step="0.1"
              value={reserveWeeks}
              onChange={(event) => setReserveWeeks((current) => boundedNumber(event.target.value, current, 0.1))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            已选路径
            <select
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              value={selectedPathwayKey}
              onChange={(event) => setPathwayKey(event.target.value)}
            >
              {PATHWAY_KEYS.map((key) => (
                <option key={key} value={key}>{key.toUpperCase()}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_0.7fr_auto]">
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            情景名称
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              value={scenarioName}
              onChange={(event) => setScenarioName(event.target.value)}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.18em] text-muted">
            管理令牌
            <input
              className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-accent hover:bg-accent-soft"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          <button
            type="button"
            className="self-end rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-surface transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle"
            onClick={postScenario}
            disabled={Boolean(saveDisabledReason)}
            aria-disabled={Boolean(saveDisabledReason)}
            title={saveDisabledReason ?? '保存当前情景'}
          >
            保存情景
          </button>
        </div>
        {saveDisabledReason ? (
          <p className="mt-2 text-xs text-muted">{saveDisabledReason}</p>
        ) : null}
      </section>

      <section>
        <FuelVsSafPriceChart
          fossilJetUsdPerL={fossilJetFigure(
            tippingPoint?.inputs.fossilJetUsdPerL ?? fossilJetUsdPerL,
            tippingPoint?.generatedAt ?? null
          )}
          effectiveFossilJetUsdPerL={effectiveFossilJetFigure(
            tippingPoint?.effectiveFossilJetUsdPerL ?? fossilJetUsdPerL,
            tippingPoint?.generatedAt ?? null
          )}
          pathways={pathways}
        />
      </section>
      <section>
        <TippingPointSimulator tippingPoint={tippingPoint} decision={decision} reserveWeeks={reserveWeeks} />
      </section>
      <section>
        <AirlineDecisionMatrix decision={decision} reserveWeeks={reserveWeeks} pathwayKey={selectedPathwayKey} />
      </section>
      <section>
        <SafPathwayComparisonTable pathways={pathways} selectedPathwayKey={selectedPathwayKey} />
      </section>
      <section>
        <ScenarioCostStackChart tippingPoint={tippingPoint} selectedPathwayKey={selectedPathwayKey} />
      </section>
    </div>
  );
}
