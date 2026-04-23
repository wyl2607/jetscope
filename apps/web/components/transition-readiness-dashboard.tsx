'use client';

import { ReactNode, useMemo, useState } from 'react';

type Country = {
  flag: string;
  name: string;
  current: number;
  target2030: number;
  policy: string;
  strength: 1 | 2 | 3 | 4 | 5;
};

type Airline = {
  name: string;
  alliance: string;
  current: number;
  target: number;
};

type Pathway = {
  name: string;
  baseCost: number;
  carbonCredit: number;
};

type TimelineEvent = {
  year: string;
  text: string;
  sub: string;
  pct: string;
  tone: 'teal' | 'amber' | 'blue' | 'red' | 'purple';
  done: boolean;
};

const countries: Country[] = [
  { flag: '🇪🇺', name: '欧盟 ReFuelEU', current: 0.7, target2030: 2, policy: '强制', strength: 5 },
  { flag: '🇩🇪', name: '德国', current: 0.5, target2030: 2, policy: '强制', strength: 4 },
  { flag: '🇺🇸', name: '美国', current: 0.4, target2030: 3, policy: '激励', strength: 3 },
  { flag: '🇯🇵', name: '日本', current: 0.2, target2030: 10, policy: '强制', strength: 4 },
  { flag: '🇳🇱', name: '荷兰 / SAF Hub', current: 1.1, target2030: 14, policy: '强制', strength: 5 },
  { flag: '🇨🇳', name: '中国', current: 0.1, target2030: 5, policy: '规划中', strength: 2 },
  { flag: '🇸🇬', name: '新加坡', current: 0.3, target2030: 3, policy: '激励', strength: 3 },
  { flag: '🇮🇳', name: '印度', current: 0.05, target2030: 1, policy: '早期', strength: 1 }
];

const airlines: Airline[] = [
  { name: 'Air France-KLM', alliance: '天合联盟', current: 1.1, target: 10 },
  { name: 'Lufthansa', alliance: '星空联盟', current: 0.8, target: 10 },
  { name: 'British Airways', alliance: '寰宇一家', current: 0.7, target: 10 },
  { name: 'Alaska Airlines', alliance: '寰宇一家', current: 0.68, target: 10 },
  { name: 'United Airlines', alliance: '星空联盟', current: 0.5, target: 10 },
  { name: 'Singapore Airlines', alliance: '星空联盟', current: 0.5, target: 5 },
  { name: 'Delta Air Lines', alliance: '天合联盟', current: 0.3, target: 10 },
  { name: 'JetBlue', alliance: '独立', current: 0.3, target: 5 }
];

const pathways: Pathway[] = [
  { name: '糖基 ATJ', baseCost: 1.6, carbonCredit: 1.5 },
  { name: '芦苇 HEFA', baseCost: 1.85, carbonCredit: 1.8 },
  { name: '纤维素 FT', baseCost: 2.3, carbonCredit: 2 },
  { name: '木质素气化 FT', baseCost: 2.65, carbonCredit: 2.1 },
  { name: '半纤维素 ATJ', baseCost: 3.1, carbonCredit: 2 },
  { name: 'PtL e-SAF', baseCost: 4.5, carbonCredit: 2.4 }
];

const timelineData: TimelineEvent[] = [
  { year: '2025', text: 'EU SAF 强制令生效', sub: '欧盟机场 2% 掺混义务', pct: '2%', tone: 'teal', done: true },
  { year: '2026', text: 'EU e-SAF 子目标启动', sub: '需含 0.7% 合成燃料', pct: 'e0.7%', tone: 'purple', done: false },
  { year: '2027', text: '印度 SAF 试点强制', sub: '国际航班 1% SAF', pct: '1%', tone: 'amber', done: false },
  { year: '2030', text: '主要市场关键节点', sub: 'EU 6% · 美国 3B 加仑 · 日本 10%', pct: '6%+', tone: 'blue', done: false },
  { year: '2035', text: 'EU SAF 大幅提升', sub: '欧盟 20% 掺混目标', pct: '20%', tone: 'amber', done: false },
  { year: '2050', text: '净零航空目标', sub: '欧盟 70% · 全行业净零', pct: '70%', tone: 'red', done: false }
];

const COUNTRY_SCALE_MAX = 14;
const AIRLINE_SCALE_MAX = 10;

function jetPrice(crude: number) {
  return 0.0082 * crude + 0.12;
}

function effectiveSafPrice(pathway: Pathway, carbon: number) {
  return pathway.baseCost - (carbon / 1000) * pathway.carbonCredit;
}

function pathwayReadiness(pathway: Pathway, crude: number, carbon: number) {
  const jet = jetPrice(crude);
  const saf = effectiveSafPrice(pathway, carbon);
  const gap = saf - jet;

  if (gap <= 0) {
    return 100;
  }

  const maxGap = Math.max(pathway.baseCost - 0.5, 0.01);
  return Math.max(0, Math.min(100, 100 - gap / maxGap * 100));
}

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

function progressTone(progress: number): 'teal' | 'amber' | 'red' | 'blue' {
  if (progress >= 55) return 'teal';
  if (progress >= 22) return 'amber';
  if (progress >= 10) return 'blue';
  return 'red';
}

function signalSummary(bestReadiness: number, bestPathway: string) {
  if (bestReadiness >= 80) {
    return {
      label: '临界接近',
      sub: `${bestPathway} 已接近成本临界点`,
      tone: 'teal' as const
    };
  }
  if (bestReadiness >= 60) {
    return {
      label: '观察窗口',
      sub: `${bestPathway} 是最早可能突破的路线`,
      tone: 'amber' as const
    };
  }
  return {
    label: '观望期',
    sub: '价格与政策仍需共同推动',
    tone: 'red' as const
  };
}

export function TransitionReadinessDashboard() {
  const [crude, setCrude] = useState(82);
  const [carbon, setCarbon] = useState(65);

  const derived = useMemo(() => {
    const jet = jetPrice(crude);
    const pathwayScores = pathways.map((pathway) => {
      const effective = effectiveSafPrice(pathway, carbon);
      const readiness = pathwayReadiness(pathway, crude, carbon);
      return {
        ...pathway,
        effective,
        readiness,
        gap: effective - jet
      };
    });

    const sortedPathways = [...pathwayScores].sort((a, b) => b.readiness - a.readiness);
    const bestPathway = sortedPathways[0];
    const signal = signalSummary(bestPathway.readiness, bestPathway.name);
    const countryProgressAverage =
      countries.reduce((sum, country) => sum + country.current / country.target2030, 0) / countries.length * 100;

    return {
      jet,
      pathwayScores,
      bestPathway,
      signal,
      countryProgressAverage,
      rankedAirlines: [...airlines].sort((a, b) => b.current - a.current)
    };
  }, [carbon, crude]);

  return (
    <section className="space-y-6 rounded-[2rem] border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-sky-950/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-300">Second page · research cockpit</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">SAF 行业转型综合仪表盘</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            把各国政策推进、航空公司 SAF 采用率、原料路线临界点和关键政策时间轴收进同一块面板，作为你日常研究与判断转型窗口期的第二页面。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SliderCard
            label="国际原油价格（Brent）"
            value={`$${crude}/桶`}
            min={40}
            max={200}
            step={1}
            current={crude}
            onChange={setCrude}
          />
          <SliderCard
            label="碳价 EU ETS"
            value={`€${carbon}/t`}
            min={0}
            max={250}
            step={5}
            current={carbon}
            onChange={setCarbon}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SignalCard label="传统航油估算" value={`$${derived.jet.toFixed(2)}/L`} sub="基于原油价格推算" tone="amber" />
        <SignalCard
          label="最低 SAF 有效价"
          value={`$${derived.bestPathway.effective.toFixed(2)}/L`}
          sub={`${derived.bestPathway.name}（含碳价修正）`}
          tone="purple"
        />
        <SignalCard label="全球 SAF 占比" value="0.6%" sub="目标 2030 年 ≥ 2%" tone="red" />
        <SignalCard
          label="转型综合信号"
          value={derived.signal.label}
          sub={derived.signal.sub}
          tone={derived.signal.tone}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="各国政策推进进度" subtitle="灰线为 2030 目标，彩色条代表当前推进">
          <div className="mb-3 grid grid-cols-[112px_1fr_52px_74px] gap-2 border-b border-slate-800 pb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <span>国家 / 地区</span>
            <span>当前 / 2030 目标</span>
            <span className="text-right">现状</span>
            <span className="text-center">政策强度</span>
          </div>
          <div className="space-y-2">
            {countries.map((country) => {
              const progress = country.current / country.target2030 * 100;
              const tone = progressTone(progress);
              const classes = toneClasses(tone);

              return (
                <div
                  key={country.name}
                  className="grid grid-cols-[112px_1fr_52px_74px] items-center gap-2 border-b border-slate-900/80 py-2 last:border-none"
                >
                  <div className="text-sm font-medium text-white">
                    <span className="mr-1">{country.flag}</span>
                    {country.name}
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-800">
                    <div className={`${classes.fill} h-full rounded-full`} style={{ width: `${Math.min(country.current / COUNTRY_SCALE_MAX * 100, 100)}%` }} />
                    <div
                      className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-slate-400"
                      style={{ left: `${Math.min(country.target2030 / COUNTRY_SCALE_MAX * 100, 100)}%` }}
                    />
                  </div>
                  <div className={`text-right font-mono text-xs ${classes.text}`}>{country.current.toFixed(2)}%</div>
                  <div className={`rounded-full border px-2 py-1 text-center text-[11px] font-medium ${classes.soft}`}>
                    {country.policy}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="研究提醒" subtitle="给个人日常跟踪用的 quick take">
          <div className="space-y-4">
            <InsightRow label="政策平均完成度" value={`${derived.countryProgressAverage.toFixed(1)}%`} hint="离 2030 集体目标仍远" tone="blue" />
            <InsightRow
              label="最先接近临界点"
              value={derived.bestPathway.name}
              hint={`当前有效价 ${derived.bestPathway.effective.toFixed(2)}/L`}
              tone={derived.signal.tone}
            />
            <InsightRow label="今日研究切口" value="航空公司目标缺口" hint="头部航司距离 10% 仍悬殊" tone="amber" />
            <InsightRow label="预警" value="政策领先 ≠ 商业就绪" hint="油价/碳价联动仍决定路线排序" tone="red" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel title="主要航空公司 SAF 采用率" subtitle="按当前掺混率排序，灰线代表 2030 目标">
          <div className="mb-3 grid grid-cols-[126px_1fr_58px_58px] gap-2 border-b border-slate-800 pb-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <span>航空公司</span>
            <span>当前 / 目标</span>
            <span className="text-right">当前</span>
            <span className="text-right">2030</span>
          </div>
          <div className="space-y-2">
            {derived.rankedAirlines.map((airline) => {
              const progress = airline.current / airline.target * 100;
              const tone = progressTone(progress);
              const classes = toneClasses(tone);

              return (
                <div
                  key={airline.name}
                  className="grid grid-cols-[126px_1fr_58px_58px] items-center gap-2 border-b border-slate-900/80 py-2 last:border-none"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{airline.name}</div>
                    <div className="text-[11px] text-slate-500">{airline.alliance}</div>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-slate-800">
                    <div className={`${classes.fill} h-full rounded-full`} style={{ width: `${Math.min(airline.current / AIRLINE_SCALE_MAX * 100, 100)}%` }} />
                    <div
                      className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-slate-400"
                      style={{ left: `${Math.min(airline.target / AIRLINE_SCALE_MAX * 100, 100)}%` }}
                    />
                  </div>
                  <div className={`text-right font-mono text-xs ${classes.text}`}>{airline.current.toFixed(1)}%</div>
                  <div className="text-right font-mono text-xs text-slate-400">{airline.target}%</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="关键政策里程碑" subtitle="实心点已生效，空心点是未来观察窗口">
          <div className="relative space-y-4 pl-5">
            <div className="absolute bottom-1 left-[5px] top-1 w-px bg-slate-800" />
            {timelineData.map((item) => {
              const classes = toneClasses(item.tone);
              return (
                <div key={`${item.year}-${item.text}`} className="relative flex gap-4">
                  <div
                    className={`absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2 ${item.done ? classes.fill : 'bg-slate-950'} ${item.done ? 'border-transparent' : 'border-slate-500'}`}
                  />
                  <div className="min-w-[44px] font-mono text-xs text-slate-500">{item.year}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{item.text}</div>
                    <div className="text-xs text-slate-400">{item.sub}</div>
                  </div>
                  <div className={`font-mono text-xs ${classes.text}`}>{item.pct}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="原料路线转型就绪度（实时）" subtitle="随着原油和碳价变化，动态感知谁最早跨过成本阈值">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {derived.pathwayScores.map((pathway) => {
            const tone = progressTone(pathway.readiness);
            const classes = toneClasses(tone);

            return (
              <article key={pathway.name} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-white">{pathway.name}</h4>
                    <p className="mt-1 text-xs text-slate-500">基准成本 ${pathway.baseCost.toFixed(2)}/L</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${classes.soft}`}>
                    就绪度 {pathway.readiness.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-800">
                  <div className={`${classes.fill} h-full rounded-full`} style={{ width: `${pathway.readiness}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>有效价 ${pathway.effective.toFixed(2)}/L</span>
                  <span className={pathway.gap <= 0 ? 'text-emerald-300' : 'text-slate-500'}>
                    {pathway.gap <= 0 ? '已跨过 parity' : `差 ${pathway.gap.toFixed(2)}/L`}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
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
