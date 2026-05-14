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
        text: 'text-emerald-700',
        fill: 'bg-emerald-500',
        soft: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    case 'amber':
      return {
        text: 'text-amber-700',
        fill: 'bg-amber-500',
        soft: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    case 'blue':
      return {
        text: 'text-sky-700',
        fill: 'bg-sky-500',
        soft: 'bg-sky-50 text-sky-700 border-sky-200'
      };
    case 'purple':
      return {
        text: 'text-violet-700',
        fill: 'bg-violet-500',
        soft: 'bg-violet-50 text-violet-700 border-violet-200'
      };
    case 'red':
    default:
      return {
        text: 'text-rose-700',
        fill: 'bg-rose-500',
        soft: 'bg-rose-50 text-rose-700 border-rose-200'
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
          setError(nextError instanceof Error ? nextError.message : '刷新仪表盘输入失败');
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
    <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-200/70">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-700">转型监测</p>
          <h3 className="mt-3 text-2xl font-semibold text-slate-950">SAF 行业转型综合仪表盘</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
            这里把燃油价格、碳价、储备压力和政策目标放在同一个工作区，帮助团队判断哪些 SAF 路径已经接近可执行区间。
          </p>
          <p className="mt-3 text-xs text-slate-600">
            储备来源：{initialReserve.source_name} · 置信度 {Math.round(initialReserve.confidence_score * 100)}%
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SliderCard
            label="化石航油价格"
            value={`$${fossilJet.toFixed(2)}/L`}
            min={0.6}
            max={3.0}
            step={0.05}
            current={fossilJet}
            onChange={setFossilJet}
          />
          <SliderCard
            label="碳价"
            value={`€${carbon.toFixed(0)}/t`}
            min={0}
            max={250}
            step={5}
            current={carbon}
            onChange={setCarbon}
          />
          <SliderCard
            label="储备周数"
            value={`${reserveWeeks.toFixed(1)}w`}
            min={1}
            max={8}
            step={0.5}
            current={reserveWeeks}
            onChange={setReserveWeeks}
          />
          <SliderCard
            label="补贴"
            value={`$${subsidy.toFixed(2)}/L`}
            min={0}
            max={0.6}
            step={0.05}
            current={subsidy}
            onChange={setSubsidy}
          />
          <SelectCard
            label="路径"
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
          label="化石航油"
          value={`$${tippingPoint.inputs.fossil_jet_usd_per_l.toFixed(2)}/L`}
          sub="标准拐点输入"
          tone="amber"
        />
        <SignalCard
          label="有效化石航油成本"
          value={`$${tippingPoint.effective_fossil_jet_usd_per_l.toFixed(2)}/L`}
          sub="现货价格叠加碳成本压力"
          tone="blue"
        />
        <SignalCard
          label="最优路径"
          value={derived.bestPathway?.display_name ?? '无数据'}
          sub={derived.bestPathway ? `价差 ${derived.bestPathway.spread_low_pct.toFixed(1)}% 至 ${derived.bestPathway.spread_high_pct.toFixed(1)}%` : '等待路径数据'}
          tone="purple"
        />
        <SignalCard
          label="转型信号"
          value={derived.signal.label}
          sub={derived.signal.sub}
          tone={derived.signal.tone}
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          实时情景引擎暂不可用，模拟器正在显示可编辑的基准输入。
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
        <Panel title="各国政策推进进度" subtitle="用统一国家目标口径对比当前采用率和 2030 目标">
          <div className="mb-3 grid grid-cols-[112px_1fr_52px_74px] gap-2 border-b border-slate-200 pb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
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
                  className="grid grid-cols-[112px_1fr_52px_74px] items-center gap-2 border-b border-slate-100 py-2 last:border-none"
                >
                  <div className="text-sm font-medium text-slate-950">
                    <span className="mr-1">{country.flag}</span>
                    {country.nameZh}
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-100">
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

        <Panel title="关键政策里程碑" subtitle="把政策时间线和已知 SAF 掺混目标放在同一视图">
          <div className="relative space-y-4 pl-5">
            <div className="absolute bottom-1 left-[5px] top-1 w-px bg-slate-200" />
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
                    <div className="text-sm font-medium text-slate-950">{item.headlineZh}</div>
                    <div className="text-xs text-slate-600">
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
        <Panel title="主要航空公司 SAF 采用率" subtitle="对比当前采用率、2030 目标和估算状态">
          <div className="mb-3 grid grid-cols-[126px_1fr_58px_58px] gap-2 border-b border-slate-200 pb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
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
                  className="grid grid-cols-[126px_1fr_58px_58px] items-center gap-2 border-b border-slate-100 py-2 last:border-none"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-950">{airline.name}</div>
                    <div className="text-[11px] text-slate-500">{airline.alliance}</div>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-100">
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

        <Panel title="研究提醒" subtitle="把当前最需要复核的转型信号压缩成速览">
          <div className="space-y-4">
            <InsightRow
              label="政策平均完成度"
              value={`${derived.countryProgressAverage.toFixed(1)}%`}
              hint="共享核心国家单源仍显示 2030 目标差距较大"
              tone="blue"
            />
            <InsightRow
              label="最接近临界点"
              value={derived.bestPathway?.display_name ?? '无数据'}
              hint={
                derived.bestPathway
                  ? `当前价差 ${derived.bestPathway.spread_low_pct.toFixed(1)}% 至 ${derived.bestPathway.spread_high_pct.toFixed(1)}%`
                  : '等待路径响应'
              }
              tone={derived.signal.tone}
            />
            <InsightRow
              label="当前储备信号"
              value={reserveSeverity.level}
              hint={`${reserveWeeks.toFixed(1)} 周估算覆盖`}
              tone={reserveSeverity.tone}
            />
            <InsightRow
              label="刷新状态"
              value={loading ? '刷新中' : '稳定'}
              hint="滑块会重新计算拐点和航司响应信号"
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
    <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="font-mono text-sm text-slate-950">{value}</span>
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
    <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="font-mono text-sm text-slate-950">{value.toUpperCase()}</span>
      </div>
      <select
        className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">{title}</h4>
          <div className="h-px flex-1 bg-slate-200" />
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
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-600">{label}</div>
      <div className={`mt-3 text-3xl font-semibold ${classes.text}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-600">{sub}</div>
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-slate-600">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${classes.text}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-600">{hint}</div>
    </div>
  );
}
