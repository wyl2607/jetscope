import { InfoCard } from '@/components/cards';
import type { SourcesReadModel } from '@/lib/sources-read-model';
import type { Route } from 'next';
import Link from 'next/link';

type Props = {
  summary: SourcesReadModel['summary'];
  completeness: number;
  generatedAt: string;
  href?: Route;
};

function formatGeneratedAt(value: string): string {
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
  const content = (
    <InfoCard title="来源溯源" subtitle="当前市场快照的可信状态">
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
          完整度 {Math.round(completeness * 100)}% · {summary.freshnessLabel} · 生成于 {formatGeneratedAt(generatedAt)}
        </p>
      </div>
    </InfoCard>
  );

  if (!href) return content;

  return (
    <div className="relative">
      {content}
      <Link href={href} className="absolute right-5 top-5 text-xs font-semibold text-sky-700 underline decoration-sky-500/40 hover:text-sky-800">
        查看来源
      </Link>
    </div>
  );
}
