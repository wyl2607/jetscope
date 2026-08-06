import { PageTemplate } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

const ANALYSIS_ENTRIES = [
  {
    href: '/analysis/lufthansa-flight-cuts-2026-04',
    title: 'Lufthansa Flight Cuts and Fuel Shock (2026-04)',
    summary:
      'Tracks the Lufthansa short-haul cut announcement, fuel-saving signal, and higher fuel-price shock implications for SAF break-even sensitivity.'
  }
] as const;

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Analysis Index',
  description:
    'Index of JetScope analysis pages with crawlable summaries for airline fuel shocks, policy context, and SAF competitiveness research.',
  path: '/analysis'
});

export default function AnalysisIndexPage() {
  return (
    <PageTemplate
      eyebrow="Research index"
      title="Analysis pages"
      question="哪一篇事件分析和我现在要判断的事情有关？"
      asOf={null}
    >
      <Panel
        title="事件分析"
        why="先按正在判断的事件选择研究页，再进入完整证据链；条目数量本身不代表研究充分度。"
      >
        <div className="grid gap-6">
          {ANALYSIS_ENTRIES.map((entry) => (
            <article key={entry.href} className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-subtle">{entry.href}</p>
              <h3 className="mt-2 text-lg font-medium text-ink">{entry.title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted">{entry.summary}</p>
              <Link
                className="mt-4 inline-block rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent-soft"
                href={entry.href}
              >
                Open analysis page
              </Link>
            </article>
          ))}
        </div>
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'analysis-catalog',
            label: 'JetScope 事件分析目录与各分析页的来源说明',
            basis: 'derived'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '本页只负责定位已有分析，不汇总或更新各分析页中的数据。',
          '当前只有一条事件分析；没有条目不等于对应事件没有决策价值。'
        ]}
      />
    </PageTemplate>
  );
}
