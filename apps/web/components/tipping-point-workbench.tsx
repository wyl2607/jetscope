'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { AirlineDecisionMatrix } from '@/components/airline-decision-matrix';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { ScenarioCostStackChart } from '@/components/scenario-cost-stack-chart';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import {
  type AirlineDecisionResponse,
  type DecisionReadModel,
  type TippingPointReadModel,
  type TippingPointResponse,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';

type Props = {
  initialTippingPoint: TippingPointReadModel | null;
  initialDecision: DecisionReadModel | null;
  initialReserveWeeks: number;
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

function finiteNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedNumber(value: string, fallback: number, min: number, max = Number.POSITIVE_INFINITY): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatNumber(value: number, digits = 2): string {
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
      const payload = {
        name: trimmed,
        preferences: {
          schema_version: 1,
          crudeSource: 'manual',
          carbonSource: 'manual',
          benchmarkMode: 'live-jet-spot',
          carbonPriceUsdPerTonne: Number((carbonPriceEurPerT * 1.08).toFixed(2)),
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
        route_edits: selectedPathway
          ? {
              [selectedPathway.pathway_key]: {
                name: selectedPathway.display_name,
                pathway: selectedPathway.pathway_key,
                baseCostUsdPerLiter: Number(
                  ((selectedPathway.net_cost_low_usd_per_l + selectedPathway.net_cost_high_usd_per_l) / 2).toFixed(4)
                ),
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
    <>
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">交互式拐点工作台</h2>
            <p className="mt-2 text-sm text-slate-600">
              调整市场与政策假设。结果通过现有 FastAPI 分析合约重新计算，URL 会保持可分享。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-500 hover:bg-sky-100"
              onClick={useLiveValues}
            >
              使用实时值
            </button>
            <span className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700" aria-live="polite">
              {isPending ? '正在更新 URL...' : status}
            </span>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            化石航油 USD/L
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              type="number"
              min="0.1"
              step="0.01"
              value={fossilJetUsdPerL}
              onChange={(event) => setFossilJetUsdPerL((current) => boundedNumber(event.target.value, current, 0.1))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            碳价 EUR/t
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              type="number"
              min="0"
              step="1"
              value={carbonPriceEurPerT}
              onChange={(event) => setCarbonPriceEurPerT((current) => boundedNumber(event.target.value, current, 0))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            补贴 USD/L
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              type="number"
              min="0"
              step="0.01"
              value={subsidyUsdPerL}
              onChange={(event) => setSubsidyUsdPerL((current) => boundedNumber(event.target.value, current, 0))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            掺混比例 %
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              type="number"
              min="0"
              max="100"
              step="1"
              value={blendRatePct}
              onChange={(event) => setBlendRatePct((current) => boundedNumber(event.target.value, current, 0, 100))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            储备周数
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              type="number"
              min="0.1"
              step="0.1"
              value={reserveWeeks}
              onChange={(event) => setReserveWeeks((current) => boundedNumber(event.target.value, current, 0.1))}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            已选路径
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              value={selectedPathwayKey}
              onChange={(event) => setPathwayKey(event.target.value)}
            >
              {PATHWAY_KEYS.map((key) => (
                <option key={key} value={key}>{key.toUpperCase()}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.7fr_auto]">
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            情景名称
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              value={scenarioName}
              onChange={(event) => setScenarioName(event.target.value)}
            />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] text-slate-600">
            管理令牌
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              type="password"
              value={adminToken}
              onChange={(event) => handleAdminTokenChange(event.target.value)}
              placeholder="x-admin-token"
            />
          </label>
          <button
            type="button"
            className="self-end rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-500 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={postScenario}
            disabled={Boolean(saveDisabledReason)}
            aria-disabled={Boolean(saveDisabledReason)}
            title={saveDisabledReason ?? '保存当前情景'}
          >
            保存情景
          </button>
        </div>
        {saveDisabledReason ? (
          <p className="mt-2 text-xs text-slate-500">{saveDisabledReason}</p>
        ) : null}
      </section>

      <section className="mb-8">
        <FuelVsSafPriceChart
          fossilJetUsdPerL={tippingPoint?.inputs.fossilJetUsdPerL ?? fossilJetUsdPerL}
          effectiveFossilJetUsdPerL={tippingPoint?.effectiveFossilJetUsdPerL ?? fossilJetUsdPerL}
          pathways={pathways}
        />
      </section>
      <section className="mb-8">
        <TippingPointSimulator tippingPoint={tippingPoint} decision={decision} reserveWeeks={reserveWeeks} />
      </section>
      <section className="mb-8">
        <AirlineDecisionMatrix decision={decision} reserveWeeks={reserveWeeks} pathwayKey={selectedPathwayKey} />
      </section>
      <section className="mb-8">
        <SafPathwayComparisonTable pathways={pathways} selectedPathwayKey={selectedPathwayKey} />
      </section>
      <section className="mb-8">
        <ScenarioCostStackChart tippingPoint={tippingPoint} selectedPathwayKey={selectedPathwayKey} />
      </section>
    </>
  );
}
