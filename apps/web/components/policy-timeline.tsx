import type { ReactNode } from 'react';

/**
 * Policy milestone timeline component for SAF vs Oil dashboard.
 * Displays key regulatory milestones based on their status relative to current/market time.
 */

interface Milestone {
  year: number;
  title: string;
  description: string;
  regions: string[];
  target?: string;
}

const MILESTONES: Milestone[] = [
  {
    year: 2025,
    title: 'EU SAF Mandate Effective',
    description: 'European Union SAF blending obligation begins',
    regions: ['EU'],
    target: '2% blending requirement at EU airports',
  },
  {
    year: 2026,
    title: 'EU e-SAF Sub-target Launch',
    description: 'Synthetic fuel component introduced',
    regions: ['EU'],
    target: '0.7% synthetic fuel mandate',
  },
  {
    year: 2027,
    title: 'India SAF Trial Mandate',
    description: 'International flight SAF requirement begins',
    regions: ['India'],
    target: '1% SAF for international flights',
  },
  {
    year: 2030,
    title: 'Major Market Milestones',
    description: 'Key regulatory targets across major regions',
    regions: ['EU', 'USA', 'Japan'],
    target: 'EU 6% · USA 3B gallons · Japan 10%',
  },
  {
    year: 2035,
    title: 'EU SAF Significant Increase',
    description: 'Major blending target escalation',
    regions: ['EU'],
    target: '20% blending requirement',
  },
  {
    year: 2050,
    title: 'Net-Zero Aviation Target',
    description: 'Industry-wide net-zero commitment',
    regions: ['Global'],
    target: 'EU 70% · Industry net-zero',
  },
];

interface PolicyTimelineProps {
  currentTimestamp?: number; // Unix timestamp in milliseconds; defaults to now()
  className?: string;
}

export function PolicyTimeline({ currentTimestamp = Date.now(), className = '' }: PolicyTimelineProps) {
  const currentYear = new Date(currentTimestamp).getFullYear();

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
        <h2 className="text-2xl font-bold text-slate-100">Policy Milestone Timeline</h2>
        <p className="text-sm text-slate-400 mt-1">
          Regulatory targets based on market data from {new Date(currentTimestamp).toLocaleDateString()}
        </p>
      </div>

      <div className="relative space-y-6 pl-8">
        {/* Vertical timeline line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-slate-700 via-slate-600 to-slate-700" />

        {MILESTONES.map((milestone, idx) => {
          const status = getMilestoneStatus(milestone.year);
          const styles = getStatusStyles(status);

          return (
            <div key={`${milestone.year}-${idx}`} className={`relative ${styles.container}`}>
              {/* Timeline dot */}
              <div
                className={`absolute -left-7 top-1 w-4 h-4 rounded-full ring-2 ${styles.dot} transition-all duration-300`}
              />

              {/* Vertical connector line for future milestones */}
              {idx < MILESTONES.length - 1 && status !== 'past' && (
                <div className={`absolute left-2 top-6 bottom-0 w-px ${styles.line}`} />
              )}

              {/* Content */}
              <div className="space-y-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-bold text-slate-100">{milestone.year}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${styles.badge}`}>
                    {status === 'past' ? '✓ Past' : status === 'current' ? '◆ Current' : '→ Upcoming'}
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
                    📊 Target: <span className="text-slate-200">{milestone.target}</span>
                  </p>
                )}

                {/* "From now to next milestone" text for future milestones */}
                {status === 'future' && idx < MILESTONES.length - 1 && (
                  <p className="text-xs text-slate-500 mt-2 italic">
                    {MILESTONES[idx + 1].year - milestone.year} years to next milestone
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
          <span className="text-slate-400">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-400 animate-pulse" />
          <span className="text-slate-300">Current Year</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-600/50 ring-2 ring-slate-500/30" />
          <span className="text-slate-500">Upcoming</span>
        </div>
      </div>
    </div>
  );
}

export type { PolicyTimelineProps };
