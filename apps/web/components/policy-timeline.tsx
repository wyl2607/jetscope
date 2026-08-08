import type { ReactNode } from 'react';

/**
 * Policy milestone timeline component for the JetScope dashboard.
 * Displays key regulatory milestones based on their status relative to current/market time.
 */

interface Milestone {
  year: number; // figure-contract-lint-ignore: calendar year of a policy milestone, not a measurement
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
    yearsUntil: (years: number) => `距下一里程碑还有 ${years} 年`, // figure-contract-lint-ignore: copy template parameter, not a prop
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
    yearsUntil: (years: number) => `${years} Jahre bis zum nächsten Meilenstein`, // figure-contract-lint-ignore: copy template parameter, not a prop
    legendPast: 'Abgeschlossen',
    legendCurrent: 'Aktuelles Jahr',
    legendFuture: 'Bevorstehend',
  },
} as const;

interface PolicyTimelineProps {
  // figure-contract-lint-ignore: injectable clock for tests, not a measurement
  currentTimestamp?: number; // Unix timestamp in milliseconds; defaults to now()
  className?: string;
  locale?: PolicyTimelineLocale;
}

export function PolicyTimeline({ currentTimestamp = Date.now(), className = '', locale = 'zh' }: PolicyTimelineProps) {
  const currentYear = new Date(currentTimestamp).getFullYear();
  const milestones = MILESTONES_BY_LOCALE[locale];
  const copy = COPY_BY_LOCALE[locale];

  const getMilestoneStatus = (year: number): 'past' | 'current' | 'future' => { // figure-contract-lint-ignore: calendar year, not a measurement
    if (year < currentYear) return 'past';
    if (year === currentYear) return 'current';
    return 'future';
  };

  const getStatusStyles = (status: 'past' | 'current' | 'future') => {
    switch (status) {
      case 'past':
        return {
          container: 'opacity-70',
          dot: 'bg-success/60 ring-success/30',
          line: 'bg-success/40',
          content: 'text-muted',
          badge: 'bg-success-soft text-success',
        };
      case 'current':
        return {
          container: 'ring-1 ring-accent/50 rounded-lg p-4 bg-accent-soft',
          dot: 'bg-accent ring-accent ring-2',
          line: 'bg-accent',
          content: 'text-ink',
          badge: 'bg-accent-soft text-accent animate-pulse',
        };
      case 'future':
        return {
          container: 'opacity-50 hover:opacity-75 transition-opacity',
          dot: 'bg-line-strong ring-line',
          line: 'bg-line',
          content: 'text-muted',
          badge: 'bg-surface-muted text-muted',
        };
    }
  };

  return (
    // Bare artifact: the title comes from the wrapping Panel. The reference
    // date stays: it says which "now" the timeline is drawn against, which is a
    // value, not a heading.
    <div className={`policy-timeline ${className}`}>
      <p className="mb-6 text-sm text-muted">
        {copy.subheadingPrefix} {new Date(currentTimestamp).toLocaleDateString(copy.dateLocale)} {copy.subheadingSuffix}
      </p>

      <div className="relative space-y-6 pl-8">
        {/* Vertical timeline line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-line-strong via-line to-line-strong" />

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
                  <span className="text-3xl font-bold text-ink">{milestone.year}</span>
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
                          ? 'border-success bg-success-soft text-success'
                          : status === 'current'
                            ? 'border-accent bg-accent-soft text-accent'
                            : 'border-line bg-surface-muted text-muted'
                      }`}
                    >
                      {region}
                    </span>
                  ))}
                </div>

                {milestone.target && (
                  <p className={`text-sm font-medium mt-2 ${styles.content}`}>
                    {copy.target} <span className="text-ink">{milestone.target}</span>
                  </p>
                )}

                {/* "From now to next milestone" text for future milestones */}
                {status === 'future' && idx < milestones.length - 1 && (
                  <p className="text-xs text-muted mt-2 italic">
                    {copy.yearsUntil(milestones[idx + 1].year - milestone.year)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-8 pt-6 border-t border-line grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-success/60 ring-2 ring-success/30" />
          <span className="text-muted">{copy.legendPast}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent ring-2 ring-accent animate-pulse" />
          <span className="text-muted">{copy.legendCurrent}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-line-strong ring-2 ring-line" />
          <span className="text-muted">{copy.legendFuture}</span>
        </div>
      </div>
    </div>
  );
}

export type { PolicyTimelineProps };
