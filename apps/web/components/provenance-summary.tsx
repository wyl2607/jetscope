import type { SourcesReadModel } from '@/lib/sources-read-model';
import type { Figure } from '@/lib/figure';
import { FigureValue } from '@/components/figure-value';
import type { Route } from 'next';
import Link from 'next/link';

type Props = {
  summary: SourcesReadModel['summary'];
  completeness: Figure;
  /**
   * Null when the read model is on fallback. The fallback stamps itself with the
   * current time, so there is no honest timestamp to show - say so explicitly
   * rather than passing '' and relying on the date parse to fail.
   */
  generatedAt: string | null;
  href?: Route;
};

function formatGeneratedAt(value: string | null): string {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return date.toLocaleString('zh-CN');
}

function trustTone(summary: SourcesReadModel['summary']): string {
  if (summary.fallbackCount > 0 || summary.degradedCount > 0) return 'text-amber-700';
  if (summary.proxyCount > 0) return 'text-sky-700';
  return 'text-emerald-700';
}

export function ProvenanceSummary({ summary, completeness, generatedAt, href }: Props) {
  // Bare artifact: card, title and why-line come from the wrapping Panel.
  const content = (
    <>
      <div className="grid gap-3 text-sm md:grid-cols-4">
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">实时</span>
          <span className="mt-1 block text-lg font-semibold text-emerald-700">{summary.liveCount}</span>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">代理</span>
          <span className="mt-1 block text-lg font-semibold text-sky-700">{summary.proxyCount}</span>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">回退</span>
          <span className="mt-1 block text-lg font-semibold text-amber-700">{summary.fallbackCount}</span>
        </p>
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">置信度</span>
          <span className="mt-1 block text-lg font-semibold text-slate-950">{Math.round(summary.averageConfidence * 100)}%</span>
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className={`text-sm font-semibold ${trustTone(summary)}`}>{summary.trustLabel}</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{summary.degradedReason}</p>
        <p className="mt-2 text-xs text-slate-500">
          完整度{' '}
          <FigureValue figure={completeness} locale="zh" size="inline" showTimestamp={false} />
          {' · '}
          {summary.freshnessLabel} · 生成于 {formatGeneratedAt(generatedAt)}
        </p>
      </div>
    </>
  );

  if (!href) return content;

  return (
    <div>
      {content}
      <Link
        href={href}
        className="mt-4 inline-block text-xs font-semibold text-accent underline decoration-accent/40 hover:decoration-accent"
      >
        查看来源
      </Link>
    </div>
  );
}
