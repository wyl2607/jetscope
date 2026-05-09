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

const MILESTONES: Milestone[] = [
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
        <h2 className="text-2xl font-bold text-slate-100">政策里程碑时间线</h2>
        <p className="text-sm text-slate-400 mt-1">
          基于 {new Date(currentTimestamp).toLocaleDateString('zh-CN')} 市场数据的监管目标
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
                    {status === 'past' ? '✓ 已完成' : status === 'current' ? '◆ 当前年份' : '→ 即将到来'}
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
                    目标：<span className="text-slate-200">{milestone.target}</span>
                  </p>
                )}

                {/* "From now to next milestone" text for future milestones */}
                {status === 'future' && idx < MILESTONES.length - 1 && (
                  <p className="text-xs text-slate-500 mt-2 italic">
                    距下一里程碑还有 {MILESTONES[idx + 1].year - milestone.year} 年
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
          <span className="text-slate-400">已完成</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-400 animate-pulse" />
          <span className="text-slate-300">当前年份</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-600/50 ring-2 ring-slate-500/30" />
          <span className="text-slate-500">即将到来</span>
        </div>
      </div>
    </div>
  );
}

export type { PolicyTimelineProps };
