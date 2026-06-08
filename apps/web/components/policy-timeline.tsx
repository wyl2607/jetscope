import type { ReactNode } from 'react';

/**
 * Policy milestone timeline component for the JetScope dashboard.
 * Displays key regulatory milestones based on their status relative to current/market time.
 */

interface Milestone {
  year: number;
  title: string;
  description: string;
  regions: string[];
  target?: string;
}

type PolicyTimelineLocale = 'zh' | 'de';

const MILESTONES_BY_LOCALE: Record<PolicyTimelineLocale, Milestone[]> = {
  zh: [
    {
      year: 2025,
      title: '欧盟 SAF 强制掺混生效',
      description: '欧盟 SAF 掺混义务开始执行',
      regions: ['EU'],
      target: '欧盟机场 2% 掺混要求',
    },
    {
      year: 2026,
      title: '欧盟 e-SAF 子目标启动',
      description: '合成燃料组成部分纳入强制要求',
      regions: ['EU'],
      target: '0.7% 合成燃料要求',
    },
    {
      year: 2027,
      title: '印度 SAF 试点要求',
      description: '国际航班 SAF 要求开始执行',
      regions: ['India'],
      target: '国际航班 1% SAF',
    },
    {
      year: 2030,
      title: '主要市场里程碑',
      description: '主要区域监管目标集中到期',
      regions: ['EU', 'USA', 'Japan'],
      target: 'EU 6% · USA 3B gallons · Japan 10%',
    },
    {
      year: 2035,
      title: '欧盟 SAF 目标大幅抬升',
      description: '掺混目标进入显著上行阶段',
      regions: ['EU'],
      target: '20% 掺混要求',
    },
    {
      year: 2050,
      title: '航空净零目标',
      description: '行业级净零承诺目标',
      regions: ['Global'],
      target: 'EU 70% · 行业净零',
    },
  ],
  de: [
    {
      year: 2025,
      title: 'EU SAF-Mandat tritt in Kraft',
      description: 'Die europäische SAF-Beimischungspflicht beginnt.',
      regions: ['EU'],
      target: '2% SAF-Beimischung an EU-Flughäfen',
    },
    {
      year: 2026,
      title: 'EU e-SAF-Unterziel startet',
      description: 'Synthetische Kraftstoffe werden Teil der verbindlichen Quote.',
      regions: ['EU'],
      target: '0.7% synthetischer Kraftstoff',
    },
    {
      year: 2027,
      title: 'Indiens SAF-Pilotpflicht',
      description: 'SAF-Anforderungen für internationale Flüge starten.',
      regions: ['India'],
      target: '1% SAF auf internationalen Flügen',
    },
    {
      year: 2030,
      title: 'Meilenstein der Hauptmärkte',
      description: 'Mehrere regionale Zielquoten werden im selben Fenster fällig.',
      regions: ['EU', 'USA', 'Japan'],
      target: 'EU 6% · USA 3B gallons · Japan 10%',
    },
    {
      year: 2035,
      title: 'EU SAF-Ziel steigt deutlich',
      description: 'Die Beimischungsquote wechselt in eine starke Hochlaufphase.',
      regions: ['EU'],
      target: '20% Beimischungsanforderung',
    },
    {
      year: 2050,
      title: 'Netto-Null-Ziel der Luftfahrt',
      description: 'Langfristige Netto-Null-Verpflichtung auf Branchenebene.',
      regions: ['Global'],
      target: 'EU 70% · Branche netto null',
    },
  ],
};

const COPY_BY_LOCALE = {
  zh: {
    heading: '政策里程碑时间线',
    subheadingPrefix: '基于',
    subheadingSuffix: '市场数据的监管目标',
    dateLocale: 'zh-CN',
    status: {
      past: '✓ 已完成',
      current: '◆ 当前年份',
      future: '→ 即将到来',
    },
    target: '目标：',
    yearsUntil: (years: number) => `距下一里程碑还有 ${years} 年`,
    legendPast: '已完成',
    legendCurrent: '当前年份',
    legendFuture: '即将到来',
  },
  de: {
    heading: 'Policy-Meilenstein-Zeitlinie',
    subheadingPrefix: 'Regulatorische Ziele auf Basis der Marktdaten vom',
    subheadingSuffix: '',
    dateLocale: 'de-DE',
    status: {
      past: '✓ Abgeschlossen',
      current: '◆ Aktuelles Jahr',
      future: '→ Bevorstehend',
    },
    target: 'Ziel:',
    yearsUntil: (years: number) => `${years} Jahre bis zum nächsten Meilenstein`,
    legendPast: 'Abgeschlossen',
    legendCurrent: 'Aktuelles Jahr',
    legendFuture: 'Bevorstehend',
  },
} as const;

interface PolicyTimelineProps {
  currentTimestamp?: number; // Unix timestamp in milliseconds; defaults to now()
  className?: string;
  locale?: PolicyTimelineLocale;
}

export function PolicyTimeline({ currentTimestamp = Date.now(), className = '', locale = 'zh' }: PolicyTimelineProps) {
  const currentYear = new Date(currentTimestamp).getFullYear();
  const milestones = MILESTONES_BY_LOCALE[locale];
  const copy = COPY_BY_LOCALE[locale];

  const getMilestoneStatus = (year: number): 'past' | 'current' | 'future' => {
    if (year < currentYear) return 'past';
    if (year === currentYear) return 'current';
    return 'future';
  };

  const getStatusStyles = (status: 'past' | 'current' | 'future') => {
    switch (status) {
      case 'past':
        return {
          container: 'opacity-70',
          dot: 'bg-green-500/60 ring-green-500/30',
          line: 'bg-green-500/40',
          content: 'text-slate-400',
          badge: 'bg-green-500/20 text-green-300',
        };
      case 'current':
        return {
          container: 'ring-1 ring-blue-500/50 rounded-lg p-4 bg-blue-500/5',
          dot: 'bg-blue-500 ring-blue-400 ring-2',
          line: 'bg-blue-500',
          content: 'text-slate-100',
          badge: 'bg-blue-500/30 text-blue-200 animate-pulse',
        };
      case 'future':
        return {
          container: 'opacity-50 hover:opacity-75 transition-opacity',
          dot: 'bg-slate-600/50 ring-slate-500/30',
          line: 'bg-slate-600/30',
          content: 'text-slate-500',
          badge: 'bg-slate-700/40 text-slate-300',
        };
    }
  };

  return (
    <div className={`policy-timeline ${className}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-100">{copy.heading}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {copy.subheadingPrefix} {new Date(currentTimestamp).toLocaleDateString(copy.dateLocale)} {copy.subheadingSuffix}
        </p>
      </div>

      <div className="relative space-y-6 pl-8">
        {/* Vertical timeline line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-slate-700 via-slate-600 to-slate-700" />

        {milestones.map((milestone, idx) => {
          const status = getMilestoneStatus(milestone.year);
          const styles = getStatusStyles(status);

          return (
            <div key={`${milestone.year}-${idx}`} className={`relative ${styles.container}`}>
              {/* Timeline dot */}
              <div
                className={`absolute -left-7 top-1 w-4 h-4 rounded-full ring-2 ${styles.dot} transition-all duration-300`}
              />

              {/* Vertical connector line for future milestones */}
              {idx < milestones.length - 1 && status !== 'past' && (
                <div className={`absolute left-2 top-6 bottom-0 w-px ${styles.line}`} />
              )}

              {/* Content */}
              <div className="space-y-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-bold text-slate-100">{milestone.year}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${styles.badge}`}>
                    {copy.status[status]}
                  </span>
                </div>

                <h3 className={`text-lg font-semibold ${styles.content}`}>{milestone.title}</h3>

                <p className={`text-sm ${styles.content}`}>{milestone.description}</p>

                <div className="flex gap-2 flex-wrap">
                  {milestone.regions.map((region) => (
                    <span
                      key={region}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        status === 'past'
                          ? 'border-green-500/30 bg-green-500/10 text-green-300'
                          : status === 'current'
                            ? 'border-blue-500/50 bg-blue-500/15 text-blue-200'
                            : 'border-slate-600/50 bg-slate-700/20 text-slate-400'
                      }`}
                    >
                      {region}
                    </span>
                  ))}
                </div>

                {milestone.target && (
                  <p className={`text-sm font-medium mt-2 ${styles.content}`}>
                    {copy.target} <span className="text-slate-200">{milestone.target}</span>
                  </p>
                )}

                {/* "From now to next milestone" text for future milestones */}
                {status === 'future' && idx < milestones.length - 1 && (
                  <p className="text-xs text-slate-500 mt-2 italic">
                    {copy.yearsUntil(milestones[idx + 1].year - milestone.year)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-8 pt-6 border-t border-slate-700 grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500/60 ring-2 ring-green-500/30" />
          <span className="text-slate-400">{copy.legendPast}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-400 animate-pulse" />
          <span className="text-slate-300">{copy.legendCurrent}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-600/50 ring-2 ring-slate-500/30" />
          <span className="text-slate-500">{copy.legendFuture}</span>
        </div>
      </div>
    </div>
  );
}

export type { PolicyTimelineProps };
