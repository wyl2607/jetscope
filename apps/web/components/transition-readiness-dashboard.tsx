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
import { assumed, derived as derivedFigure, observed, type Figure } from '@/lib/figure';
import { toPathwayCostRow } from '@/lib/pathways-read-model';
import { toTippingPointReadModel, type AirlineDecisionResponse, type ReserveSignal, type TippingPointResponse } from '@/lib/product-read-model';

const READINESS_SOURCE_ID = 'saf-tipping-model';

function fossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null
): Figure {
  if (asOf) {
    return observed({
      value,
      unit: 'USD/L',
      sourceId: READINESS_SOURCE_ID,
      asOf,
      precision: 2
    });
  }
  return assumed({
    value,
    unit: 'USD/L',
    sourceId: READINESS_SOURCE_ID,
    precision: 2,
    method: 'transition-readiness fossil-jet input without source timestamp'
  });
}

function effectiveFossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null
): Figure {
  return derivedFigure({
    value,
    unit: 'USD/L',
    sourceId: READINESS_SOURCE_ID,
    asOf,
    precision: 2,
    method:
      'effective fossil jet = spot fossil jet + carbon price pressure at selected blend rate, minus subsidy (tipping-point model)'
  });
}

function pathwayCostRows(tippingPoint: TippingPointResponse) {
  const asOf = tippingPoint.generated_at ?? null;
  const opts = asOf
    ? ({ asOf, basis: 'observed' as const })
    : ({
        asOf: null,
        basis: 'assumption' as const,
        method: 'transition-readiness pathway cost without source timestamp'
      });
  return tippingPoint.pathways.map((row) => toPathwayCostRow(row, opts));
}

type PolicyTarget = {
  year: number;
  saf_share_pct: number;
  synthetic_share_pct: number;
  label: string;
};

type Props = {
  initialTippingPoint: TippingPointResponse;
  initialDecision: AirlineDecisionResponse;
  initialReserve: ReserveSignal | null;
  policyTargets: PolicyTarget[];
};

function toneClasses(tone: 'teal' | 'amber' | 'blue' | 'red' | 'purple') {
  switch (tone) {
    case 'teal':
      return {
        text: 'text-success',
        fill: 'bg-success',
        soft: 'bg-success-soft text-success border-success'
      };
    case 'amber':
      return {
        text: 'text-warning',
        fill: 'bg-warning',
        soft: 'bg-warning-soft text-warning border-warning'
      };
    case 'blue':
      return {
        text: 'text-accent',
        fill: 'bg-accent',
        soft: 'bg-accent-soft text-accent border-accent'
      };
    case 'purple':
      // Distinct from 'blue' on purpose. Both mapping to accent made an --info
      // timeline item and a --purple one render identically, and made the
      // refreshing state look like a normal info state. Purple is not a fifth
      // severity, so it takes the neutral-but-visible ink treatment rather than
      // a new semantic token.
      return {
        text: 'text-ink',
        fill: 'bg-ink',
        soft: 'bg-surface-muted text-ink border-line-strong'
      };
    case 'red':
    default:
      return {
        text: 'text-danger',
        fill: 'bg-danger',
        soft: 'bg-danger-soft text-danger border-danger'
      };
  }
}

function policyLabel(policyType: string): string {
  if (policyType === 'mandate') return '强制';
  if (policyType === 'incentive') return '激励';
  if (policyType === 'planning') return '规划中';
  return '早期';
}

function progressTone(progress: number): 'teal' | 'amber' | 'red' | 'blue' { // figure-contract-lint-ignore: internal tone helper parameter, not a prop
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
  const initialReserveWeeks = initialReserve?.coverage_weeks ?? 3;
  const reserveSeedFigure: Figure = initialReserve
    ? initialReserve.source_type === 'official'
      ? observed({
          value: initialReserve.coverage_weeks,
          unit: 'weeks',
          sourceId: 'eu-reserve',
          asOf: initialReserve.generated_at,
          precision: 1
        })
      : initialReserve.source_type === 'derived'
        ? derivedFigure({
            value: initialReserve.coverage_weeks,
            unit: 'weeks',
            sourceId: 'eu-reserve',
            asOf: initialReserve.generated_at,
            precision: 1,
            method: `derived reserve coverage from ${initialReserve.source_name}`
          })
        : assumed({
            value: initialReserve.coverage_weeks,
            unit: 'weeks',
            sourceId: 'eu-reserve',
            precision: 1,
            method: `reserve coverage from ${initialReserve.source_name} (${initialReserve.source_type})`
          })
    : assumed({
        value: 3,
        unit: 'weeks',
        sourceId: 'eu-reserve',
        precision: 1,
        method: '实时储备数据不可用；3.0w 仅为可编辑情景假设'
      });
  const [reserveWeeks, setReserveWeeks] = useState(initialReserveWeeks);
  const reserveFigure: Figure =
    reserveSeedFigure.value != null && Math.abs(reserveSeedFigure.value - reserveWeeks) < 1e-9
      ? reserveSeedFigure
      : assumed({
          value: reserveWeeks,
          unit: 'weeks',
          sourceId: reserveSeedFigure.sourceId,
          precision: 1,
          method: 'transition-readiness reserve-weeks control (user-adjusted scenario input)'
        });
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
    <div className="min-w-0 space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs leading-6 text-muted">
            {initialReserve
              ? `储备来源：${initialReserve.source_name} · 置信度 ${Math.round(initialReserve.confidence_score * 100)}%`
              : '实时储备数据不可用；3.0w 仅为可编辑情景假设，不代表实际储备。'}
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
            label={reserveSeedFigure.basis === 'assumption' ? '储备周数（假设）' : '储备周数'}
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
          sub={
            derived.bestPathway
              ? `价差 ${derived.bestPathway.spread_low_pct.toFixed(1)}% 至 ${derived.bestPathway.spread_high_pct.toFixed(1)}%`
              : '等待路径数据'
          }
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
        <div className="rounded-2xl border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          实时情景引擎暂不可用，模拟器正在显示可编辑的基准输入。
        </div>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <FuelVsSafPriceChart
          fossilJetUsdPerL={fossilJetFigure(
            tippingPoint.inputs.fossil_jet_usd_per_l,
            tippingPoint.generated_at
          )}
          effectiveFossilJetUsdPerL={effectiveFossilJetFigure(
            tippingPoint.effective_fossil_jet_usd_per_l,
            tippingPoint.generated_at
          )}
          pathways={pathwayCostRows(tippingPoint)}
        />
        <TippingPointSimulator
          tippingPoint={toTippingPointReadModel(tippingPoint)}
          decision={{
            signal: decision.signal,
            probabilities: decision.probabilities
          }}
          reserveWeeks={reserveFigure}
        />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SafPathwayComparisonTable
          pathways={pathwayCostRows(tippingPoint)}
          selectedPathwayKey={selectedPathwayKey}
        />
        <AirlineDecisionMatrix
          decision={decision}
          reserveWeeks={reserveFigure}
          pathwayKey={selectedPathwayKey}
        />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SubSection title="各国政策推进进度" why="用统一国家目标口径对比当前采用率和 2030 目标，判断政策推进是否跟得上转型压力。">
          <div className="mb-3 grid grid-cols-[112px_1fr_52px_74px] gap-2 border-b border-line pb-2 text-[11px] uppercase tracking-[0.12em] text-muted">
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
                  className="grid grid-cols-[112px_1fr_52px_74px] items-center gap-2 border-b border-line py-2 last:border-none"
                >
                  <div className="text-sm font-medium text-ink">
                    <span className="mr-1">{country.flag}</span>
                    {country.nameZh}
                  </div>
                  <div className="relative h-2.5 rounded-full bg-surface-muted">
                    <div
                      className={`${classes.fill} h-full rounded-full`}
                      style={{ width: `${Math.min((country.currentPct / 14) * 100, 100)}%` }}
                    />
                    <div
                      className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-line-strong"
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
        </SubSection>

        <SubSection title="关键政策里程碑" why="把政策时间线和已知 SAF 掺混目标放在同一视图，避免把已生效规则误读成未来催化剂。">
          <div className="relative space-y-4 pl-5">
            <div className="absolute bottom-1 left-[5px] top-1 w-px bg-line" />
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
                  <div className="min-w-[44px] font-mono text-xs text-muted">{item.year}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{item.headlineZh}</div>
                    <div className="text-xs text-muted">
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
        </SubSection>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SubSection title="主要航空公司 SAF 采用率" why="对比当前采用率、2030 目标和估算状态，判断行业采用进度是否支撑当前情景。">
          <div className="mb-3 grid grid-cols-[126px_1fr_58px_58px] gap-2 border-b border-line pb-2 text-[11px] uppercase tracking-[0.12em] text-muted">
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
                  className="grid grid-cols-[126px_1fr_58px_58px] items-center gap-2 border-b border-line py-2 last:border-none"
                >
                  <div>
                    <div className="text-sm font-medium text-ink">{airline.name}</div>
                    <div className="text-[11px] text-muted">{airline.alliance}</div>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-surface-muted">
                    <div
                      className={`${classes.fill} h-full rounded-full`}
                      style={{ width: `${Math.min((airline.currentPct / 10) * 100, 100)}%` }}
                    />
                    <div
                      className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-line-strong"
                      style={{ left: `${Math.min((airline.target2030Pct / 10) * 100, 100)}%` }}
                    />
                  </div>
                  <div className={`text-right font-mono text-xs ${classes.text}`}>{airline.currentPct.toFixed(1)}%</div>
                  <div className="text-right font-mono text-xs text-muted">{airline.target2030Pct}%</div>
                </div>
              );
            })}
          </div>
        </SubSection>

        <SubSection title="研究提醒" why="把当前最需要复核的转型信号压缩成速览，帮助读者决定下一步先查哪条证据。">
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
        </SubSection>
      </div>

      <ScenarioCostStackChart
        tippingPoint={toTippingPointReadModel(tippingPoint)}
        selectedPathwayKey={selectedPathwayKey}
      />
    </div>
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
  min: number; // figure-contract-lint-ignore: slider bound, not a measurement
  max: number; // figure-contract-lint-ignore: slider bound, not a measurement
  step: number; // figure-contract-lint-ignore: slider step, not a measurement
  onChange: (value: number) => void; // figure-contract-lint-ignore: callback signature, not a measurement
}) {
  return (
    <label className="rounded-2xl border border-line bg-surface-muted px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-mono text-sm text-ink">{value}</span>
      </div>
      <input
        className="mt-3 w-full accent-accent"
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
    <label className="rounded-2xl border border-line bg-surface-muted px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-mono text-sm text-ink">{value.toUpperCase()}</span>
      </div>
      <select
        className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
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

/**
 * A block *inside* a Panel. Deliberately not the shared Panel: this whole
 * dashboard already sits in one, and a full-weight Panel nested in a Panel is
 * the box-inside-an-identical-box that contract section 2 rule 3 exists to
 * prevent. Subordinate title weight, no shadow, tighter padding.
 *
 * Named SubSection rather than Panel so it cannot shadow the shared import the
 * way the previous local definition did.
 */
function SubSection({
  title,
  why,
  children
}: {
  title: string;
  why: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">{title}</h4>
          <div className="h-px flex-1 bg-line" />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{why}</p>
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
    <article className="rounded-2xl border border-line bg-surface-muted p-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`mt-3 text-3xl font-semibold ${classes.text}`}>{value}</div>
      <div className="mt-2 text-sm text-muted">{sub}</div>
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
    <div className="rounded-2xl border border-line bg-surface-muted p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${classes.text}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{hint}</div>
    </div>
  );
}
