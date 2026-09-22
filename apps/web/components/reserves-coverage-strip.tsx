import type { ReserveCoverage } from '@/lib/portfolio-read-model';

type Props = {
  reserve: ReserveCoverage | null;
};

const STRESS_STYLE: Record<string, { label: string; badge: string; bar: string; text: string }> = {
  critical: {
    label: '危急',
    badge: 'border-danger bg-danger text-surface',
    bar: 'bg-danger',
    text: 'text-danger'
  },
  elevated: {
    label: '升高',
    badge: 'border-danger bg-danger-soft text-danger',
    bar: 'bg-danger',
    text: 'text-danger'
  },
  guarded: {
    label: '警戒',
    badge: 'border-warning bg-warning-soft text-warning',
    bar: 'bg-warning',
    text: 'text-warning'
  },
  normal: {
    label: '正常',
    badge: 'border-success bg-success-soft text-success',
    bar: 'bg-success',
    text: 'text-success'
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

function coverageWidth(coverageWeeks: number): number { // figure-contract-lint-ignore: bar width geometry, not a measurement
  return Math.max(8, Math.min(100, (coverageWeeks / 8) * 100));
}

export function ReservesCoverageStrip({ reserve }: Props) {
  if (!reserve) {
    return (
      // Keeps a container of its own: the tint is the message. Same reason
      // Panel's own error placeholder is coloured rather than bare.
      <div role="alert" className="rounded-xl border border-danger bg-danger-soft p-4">
        <p className="font-medium text-ink">欧盟储备数据暂不可用</p>
        <p className="mt-1 text-sm leading-6 text-danger">
          当前会话未连上实时储备服务。危机流程仍可浏览，但储备判断会标记为情景基线。
        </p>
      </div>
    );
  }

  const style = STRESS_STYLE[reserve.stress_level] ?? STRESS_STYLE.guarded;

  return (
    // Bare artifact: card, title and why-line come from the wrapping Panel.
    <div>
      <div className="flex justify-end">
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${style.badge}`}>
          {style.label}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-muted p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">覆盖</p>
          <p className={`mt-2 text-3xl font-semibold ${style.text}`}>{reserve.coverage_weeks.toFixed(2)}w</p>
          <p className="mt-1 text-xs text-muted">约 {reserve.coverage_days.toFixed(0)} 天</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-muted p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">供给缺口压力</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{reserve.estimated_supply_gap_pct.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-muted">模型推导的压力指标</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-muted p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">来源类型</p>
          <p className="mt-2 text-xl font-semibold text-ink">{reserve.source_type}</p>
          <p className="mt-1 text-xs text-muted">{reserve.source_name}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="h-3 w-full overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full ${style.bar}`}
            style={{ width: `${coverageWidth(reserve.coverage_weeks)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>0w</span>
          <span>2w 危急</span>
          <span>4w 升高</span>
          <span>8w 稳定</span>
        </div>
        <p className="mt-3 text-xs text-muted">更新于 {formatUpdatedAt(reserve.generated_at)} · 置信度 {(reserve.confidence_score * 100).toFixed(0)}%</p>
      </div>
    </div>
  );
}
