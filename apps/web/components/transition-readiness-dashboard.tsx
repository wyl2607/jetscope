'use client';

import type { ReactNode } from 'react';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { INDUSTRY_AIRLINES } from '@core/industry/airlines';
import { INDUSTRY_COUNTRIES } from '@core/industry/countries';
import { POLICY_MILESTONES } from '@core/industry/policyTimeline';
import { AirlineDecisionMatrix } from '@/components/airline-decision-matrix';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { ScenarioCostStackChart } from '@/components/scenario-cost-stack-chart';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { getReserveSeverity, getTippingPointSignalMeta, type TippingPointSignalTone } from '@/lib/market-signals';
import { toTippingPointReadModel, type AirlineDecisionResponse, type ReserveSignal, type TippingPointResponse } from '@/lib/product-read-model';

type PolicyTarget = {
  year: number;
  saf_share_pct: number;
  synthetic_share_pct: number;
  label: string;
};

type Props = {
  initialTippingPoint: TippingPointResponse;
  initialDecision: AirlineDecisionResponse;
  initialReserve: ReserveSignal;
  policyTargets: PolicyTarget[];
};

function toneClasses(tone: 'teal' | 'amber' | 'blue' | 'red' | 'purple') {
  switch (tone) {
    case 'teal':
      return {
        text: 'text-emerald-300',
        fill: 'bg-emerald-400',
        soft: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
      };
    case 'amber':
      return {
        text: 'text-amber-300',
        fill: 'bg-amber-400',
        soft: 'bg-amber-500/15 text-amber-300 border-amber-400/20'
      };
    case 'blue':
      return {
        text: 'text-sky-300',
        fill: 'bg-sky-400',
        soft: 'bg-sky-500/15 text-sky-300 border-sky-400/20'
      };
    case 'purple':
      return {
        text: 'text-violet-300',
        fill: 'bg-violet-400',
        soft: 'bg-violet-500/15 text-violet-300 border-violet-400/20'
      };
    case 'red':
    default:
      return {
        text: 'text-rose-300',
        fill: 'bg-rose-400',
        soft: 'bg-rose-500/15 text-rose-300 border-rose-400/20'
      };
  }
}

function policyLabel(policyType: string): string {
  if (policyType === 'mandate') return '强制';
  if (policyType === 'incentive') return '激励';
  if (policyType === 'planning') return '规划中';
  return '早期';
}

function progressTone(progress: number): 'teal' | 'amber' | 'red' | 'blue' {
  if (progress >= 55) return 'teal';
  if (progress >= 22) return 'amber';
  if (progress >= 10) return 'blue';
  return 'red';
}

function signalSummary(tippingPoint: TippingPointResponse): { label: string; sub: string; tone: TippingPointSignalTone } {
  const bestPathway = [...tippingPoint.pathways].sort((left, right) => left.spread_low_pct - right.spread_low_pct)[0];
  const signalMeta = getTippingPointSignalMeta(tippingPoint.signal, 'zh');
  return {
    label: signalMeta.label,
    sub: bestPathway
      ? `${bestPathway.display_name} 当前最接近临界点`
      : '路径数据暂不可用',
    tone: signalMeta.tone
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function TransitionReadinessDashboard({
  initialTippingPoint,
  initialDecision,
  initialReserve,
  policyTargets
}: Props) {
  const [fossilJet, setFossilJet] = useState(initialTippingPoint.inputs.fossil_jet_usd_per_l);
  const [carbon, setCarbon] = useState(initialTippingPoint.inputs.carbon_price_eur_per_t);
  const [subsidy, setSubsidy] = useState(initialTippingPoint.inputs.subsidy_usd_per_l);
  const [reserveWeeks, setReserveWeeks] = useState(initialReserve.coverage_weeks);
  const [selectedPathwayKey, setSelectedPathwayKey] = useState(initialDecision.inputs.pathway_key);
  const [tippingPoint, setTippingPoint] = useState(initialTippingPoint);
  const [decision, setDecision] = useState(initialDecision);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      fossil_jet_usd_per_l: fossilJet.toFixed(2),
      carbon_price_eur_per_t: carbon.toFixed(0),
      subsidy_usd_per_l: subsidy.toFixed(2),
      blend_rate_pct: initialTippingPoint.inputs.blend_rate_pct.toFixed(0)
    });
    const decisionQuery = new URLSearchParams({
      fossil_jet_usd_per_l: fossilJet.toFixed(2),
      reserve_weeks: reserveWeeks.toFixed(2),
      carbon_price_eur_per_t: carbon.toFixed(0),
      pathway_key: selectedPathwayKey
    });

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [nextTippingPoint, nextDecision] = await Promise.all([
          fetchJson<TippingPointResponse>(`/api/analysis/tipping-point?${query.toString()}`, controller.signal),
          fetchJson<AirlineDecisionResponse>(`/api/analysis/airline-decision?${decisionQuery.toString()}`, controller.signal)
        ]);
        startTransition(() => {
          setTippingPoint(nextTippingPoint);
          setDecision(nextDecision);
        });
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to refresh dashboard inputs');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, [carbon, fossilJet, initialTippingPoint.inputs.blend_rate_pct, reserveWeeks, selectedPathwayKey, subsidy]);

  const derived = useMemo(() => {
    const bestPathway = [...tippingPoint.pathways].sort((left, right) => left.spread_low_pct - right.spread_low_pct)[0];
    const countryProgressAverage =
      (INDUSTRY_COUNTRIES.reduce((sum, country) => sum + country.currentPct / country.target2030Pct, 0) /
        INDUSTRY_COUNTRIES.length) *
      100;
    const rankedAirlines = [...INDUSTRY_AIRLINES].sort((left, right) => right.currentPct - left.currentPct);
    return {
      bestPathway,
      signal: signalSummary(tippingPoint),
      countryProgressAverage,
      rankedAirlines,
      policyTargetsByYear: new Map(policyTargets.map((target) => [target.year, target]))
    };
  }, [policyTargets, tippingPoint]);
  const reserveSeverity = getReserveSeverity(reserveWeeks);

  return (
    <section className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-sky-950/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-300">Second page · canonical dashboard</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">SAF 行业转型综合仪表盘</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            这块面板不再使用本地 demo route 公式，而是直接消费 canonical tipping-point、reserve 和 policy contracts，
            作为第二个价格/拐点 dashboard 的承载页。
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Reserve source: {initialReserve.source_name} · confidence {Math.round(initialReserve.confidence_score * 100)}%
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SliderCard
            label="Fossil jet price"
            value={`$${fossilJet.toFixed(2)}/L`}
            min={0.6}
            max={3.0}
            step={0.05}
            current={fossilJet}
            onChange={setFossilJet}
          />
          <SliderCard
            label="Carbon price"
            value={`€${carbon.toFixed(0)}/t`}
            min={0}
            max={250}
            step={5}
            current={carbon}
            onChange={setCarbon}
          />
          <SliderCard
            label="Reserve weeks"
            value={`${reserveWeeks.toFixed(1)}w`}
            min={1}
            max={8}
            step={0.5}
            current={reserveWeeks}
            onChange={setReserveWeeks}
          />
          <SliderCard
            label="Subsidy"
            value={`$${subsidy.toFixed(2)}/L`}
            min={0}
            max={0.6}
            step={0.05}
            current={subsidy}
            onChange={setSubsidy}
          />
          <SelectCard
            label="Pathway"
            value={selectedPathwayKey}
            options={tippingPoint.pathways.map((pathway) => ({
              label: pathway.display_name,
              value: pathway.pathway_key
            }))}
            onChange={setSelectedPathwayKey}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SignalCard
          label="Fossil jet"
          value={`$${tippingPoint.inputs.fossil_jet_usd_per_l.toFixed(2)}/L`}
          sub="Canonical tipping-point input"
          tone="amber"
        />
        <SignalCard
          label="Effective fossil"
          value={`$${tippingPoint.effective_fossil_jet_usd_per_l.toFixed(2)}/L`}
          sub="Spot plus modeled carbon pressure"
          tone="blue"
        />
        <SignalCard
          label="Best pathway"
          value={derived.bestPathway?.display_name ?? 'n/a'}
          sub={derived.bestPathway ? `Spread ${derived.bestPathway.spread_low_pct.toFixed(1)}% to ${derived.bestPathway.spread_high_pct.toFixed(1)}%` : 'Waiting for pathway data'}
          tone="purple"
        />
        <SignalCard
          label="Transition signal"
          value={derived.signal.label}
          sub={derived.signal.sub}
          tone={derived.signal.tone}
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          Failed to refresh live scenario inputs: {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <FuelVsSafPriceChart
          fossilJetUsdPerL={tippingPoint.inputs.fossil_jet_usd_per_l}
          effectiveFossilJetUsdPerL={tippingPoint.effective_fossil_jet_usd_per_l}
          pathways={tippingPoint.pathways}
        />
        <TippingPointSimulator
          tippingPoint={{
            generatedAt: tippingPoint.generated_at,
            effectiveFossilJetUsdPerL: tippingPoint.effective_fossil_jet_usd_per_l,
            signal: tippingPoint.signal,
            inputs: {
              fossilJetUsdPerL: tippingPoint.inputs.fossil_jet_usd_per_l,
              carbonPriceEurPerT: tippingPoint.inputs.carbon_price_eur_per_t,
              subsidyUsdPerL: tippingPoint.inputs.subsidy_usd_per_l,
              blendRatePct: tippingPoint.inputs.blend_rate_pct
            },
            pathways: tippingPoint.pathways
          }}
          decision={{
            signal: decision.signal,
            probabilities: decision.probabilities
          }}
          reserveWeeks={reserveWeeks}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SafPathwayComparisonTable
          pathways={tippingPoint.pathways}
          selectedPathwayKey={selectedPathwayKey}
        />
        <AirlineDecisionMatrix
          decision={decision}
          reserveWeeks={reserveWeeks}
          pathwayKey={selectedPathwayKey}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="各国政策推进进度" subtitle="使用 shared core 的国家单源，灰线为 2030 目标">
          <div className="mb-3 grid grid-cols-[112px_1fr_52px_74px] gap-2 border-b border-slate-800 pb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <span>国家 / 地区</span>
            <span>当前 / 2030 目标</span>
            <span className="text-right">现状</span>
            <span className="text-center">政策强度</span>
          </div>
          <div className="space-y-2">
            {INDUSTRY_COUNTRIES.map((country) => {
              const progress = (country.currentPct / country.target2030Pct) * 100;
              const tone = progressTone(progress);
              const classes = toneClasses(tone);
              return (
                <div
                  key={country.id}
                  className="grid grid-cols-[112px_1fr_52px_74px] items-center gap-2 border-b border-slate-900/80 py-2 last:border-none"
                >
                  <div className="text-sm font-medium text-white">
                    <span className="mr-1">{country.flag}</span>
                    {country.nameZh}
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-800">
                    <div
                      className={`${classes.fill} h-full rounded-full`}
                      style={{ width: `${Math.min((country.currentPct / 14) * 100, 100)}%` }}
                    />
                    <div
                      className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-slate-400"
                      style={{ left: `${Math.min((country.target2030Pct / 14) * 100, 100)}%` }}
                    />
                  </div>
                  <div className={`text-right font-mono text-xs ${classes.text}`}>{country.currentPct.toFixed(2)}%</div>
                  <div className={`rounded-full border px-2 py-1 text-center text-[11px] font-medium ${classes.soft}`}>
                    {policyLabel(country.policyType)}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="关键政策里程碑" subtitle="shared core 里程碑 + live ReFuelEU targets">
          <div className="relative space-y-4 pl-5">
            <div className="absolute bottom-1 left-[5px] top-1 w-px bg-slate-800" />
            {POLICY_MILESTONES.map((item) => {
              const target = derived.policyTargetsByYear.get(item.year);
              const classes = toneClasses(
                item.color === '--success'
                  ? 'teal'
                  : item.color === '--warning'
                    ? 'amber'
                    : item.color === '--info'
                      ? 'blue'
                      : item.color === '--purple'
                        ? 'purple'
                        : 'red'
              );
              return (
                <div key={`${item.year}-${item.headlineZh}`} className="relative flex gap-4">
                  <div className={`absolute left-[-20px] top-1.5 h-3 w-3 rounded-full ${classes.fill}`} />
                  <div className="min-w-[44px] font-mono text-xs text-slate-500">{item.year}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{item.headlineZh}</div>
                    <div className="text-xs text-slate-400">
                      {target
                        ? `${item.detailZh} · SAF ${target.saf_share_pct}% / synthetic ${target.synthetic_share_pct}%`
                        : item.detailZh}
                    </div>
                  </div>
                  <div className={`font-mono text-xs ${classes.text}`}>{target?.label ?? item.pctLabel}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="主要航空公司 SAF 采用率" subtitle="采用 shared core 单源，保留估算标注">
          <div className="mb-3 grid grid-cols-[126px_1fr_58px_58px] gap-2 border-b border-slate-800 pb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <span>航空公司</span>
            <span>当前 / 目标</span>
            <span className="text-right">当前</span>
            <span className="text-right">2030</span>
          </div>
          <div className="space-y-2">
            {derived.rankedAirlines.map((airline) => {
              const progress = (airline.currentPct / airline.target2030Pct) * 100;
              const tone = progressTone(progress);
              const classes = toneClasses(tone);
              return (
                <div
                  key={airline.id}
                  className="grid grid-cols-[126px_1fr_58px_58px] items-center gap-2 border-b border-slate-900/80 py-2 last:border-none"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{airline.name}</div>
                    <div className="text-[11px] text-slate-500">{airline.alliance}</div>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-800">
                    <div
                      className={`${classes.fill} h-full rounded-full`}
                      style={{ width: `${Math.min((airline.currentPct / 10) * 100, 100)}%` }}
                    />
                    <div
                      className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-slate-400"
                      style={{ left: `${Math.min((airline.target2030Pct / 10) * 100, 100)}%` }}
                    />
                  </div>
                  <div className={`text-right font-mono text-xs ${classes.text}`}>{airline.currentPct.toFixed(1)}%</div>
                  <div className="text-right font-mono text-xs text-slate-400">{airline.target2030Pct}%</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="研究提醒" subtitle="展示优先：给第二个 dashboard 的 quick take">
          <div className="space-y-4">
            <InsightRow
              label="政策平均完成度"
              value={`${derived.countryProgressAverage.toFixed(1)}%`}
              hint="shared core 国家单源仍显示 2030 目标差距较大"
              tone="blue"
            />
            <InsightRow
              label="最接近临界点"
              value={derived.bestPathway?.display_name ?? 'n/a'}
              hint={
                derived.bestPathway
                  ? `当前 spread ${derived.bestPathway.spread_low_pct.toFixed(1)}% to ${derived.bestPathway.spread_high_pct.toFixed(1)}%`
                  : '等待 pathway response'
              }
              tone={derived.signal.tone}
            />
            <InsightRow
              label="当前 reserve signal"
              value={reserveSeverity.level}
              hint={`${reserveWeeks.toFixed(1)} weeks of modeled coverage`}
              tone={reserveSeverity.tone}
            />
            <InsightRow
              label="Refresh status"
              value={loading ? 'Refreshing' : 'Stable'}
              hint="Sliders now re-query canonical tipping-point and airline-decision contracts"
              tone={loading ? 'purple' : 'teal'}
            />
          </div>
        </Panel>
      </div>

      <ScenarioCostStackChart
        tippingPoint={toTippingPointReadModel(tippingPoint)}
        selectedPathwayKey={selectedPathwayKey}
      />
    </section>
  );
}

function SliderCard({
  label,
  value,
  current,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: string;
  current: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="font-mono text-sm text-white">{value}</span>
      </div>
      <input
        className="mt-3 w-full accent-sky-400"
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectCard({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="font-mono text-sm text-white">{value.toUpperCase()}</span>
      </div>
      <select
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Panel({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">{title}</h4>
          <div className="h-px flex-1 bg-slate-800" />
        </div>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function SignalCard({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'teal' | 'amber' | 'red' | 'blue' | 'purple';
}) {
  const classes = toneClasses(tone);

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-3 text-3xl font-semibold ${classes.text}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-400">{sub}</div>
    </article>
  );
}

function InsightRow({
  label,
  value,
  hint,
  tone
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'teal' | 'amber' | 'red' | 'blue' | 'purple';
}) {
  const classes = toneClasses(tone);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${classes.text}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-400">{hint}</div>
    </div>
  );
}
