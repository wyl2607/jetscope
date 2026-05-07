import type { ReserveCoverage } from '@/lib/portfolio-read-model';

type Props = {
  reserve: ReserveCoverage | null;
};

const STRESS_STYLE: Record<string, { label: string; badge: string; bar: string; text: string }> = {
  critical: {
    label: '危急',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    bar: 'from-rose-600 via-rose-500 to-rose-400',
    text: 'text-rose-700'
  },
  elevated: {
    label: '升高',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    bar: 'from-amber-600 via-amber-500 to-amber-400',
    text: 'text-amber-800'
  },
  guarded: {
    label: '警戒',
    badge: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    bar: 'from-yellow-600 via-yellow-500 to-yellow-400',
    text: 'text-yellow-800'
  },
  normal: {
    label: '正常',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    bar: 'from-emerald-600 via-emerald-500 to-emerald-400',
    text: 'text-emerald-800'
  }
};

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function coverageWidth(coverageWeeks: number): number {
  return Math.max(8, Math.min(100, (coverageWeeks / 8) * 100));
}

export function ReservesCoverageStrip({ reserve }: Props) {
  if (!reserve) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-rose-700">储备信号</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">欧盟储备数据暂不可用</h3>
        <p className="mt-2 text-sm text-rose-800">
          当前会话未连上实时储备服务。危机流程仍可浏览，但储备判断会标记为情景基线。
        </p>
      </section>
    );
  }

  const style = STRESS_STYLE[reserve.stress_level] ?? STRESS_STYLE.guarded;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">储备信号</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">欧盟航煤储备覆盖</h3>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${style.badge}`}>
          {style.label}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-sky-700">覆盖</p>
          <p className={`mt-2 text-3xl font-semibold ${style.text}`}>{reserve.coverage_weeks.toFixed(2)}w</p>
          <p className="mt-1 text-xs text-sky-700">约 {reserve.coverage_days.toFixed(0)} 天</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-amber-700">供给缺口压力</p>
          <p className="mt-2 text-3xl font-semibold text-amber-900">{reserve.estimated_supply_gap_pct.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-amber-700">模型推导的压力指标</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-emerald-700">来源类型</p>
          <p className="mt-2 text-xl font-semibold text-emerald-900">{reserve.source_type}</p>
          <p className="mt-1 text-xs text-emerald-700">{reserve.source_name}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
            style={{ width: `${coverageWidth(reserve.coverage_weeks)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>0w</span>
          <span>2w 危急</span>
          <span>4w 升高</span>
          <span>8w 稳定</span>
        </div>
        <p className="mt-3 text-xs text-slate-500">更新于 {formatUpdatedAt(reserve.generated_at)} · 置信度 {(reserve.confidence_score * 100).toFixed(0)}%</p>
      </div>
    </section>
  );
}
