import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
    <Shell
      eyebrow="Research index"
      title="Analysis pages"
      description="集中收录事件型分析页，提供可抓取摘要，便于搜索引擎和团队成员快速定位研究结论。"
    >
      <section className="grid gap-5">
        {ANALYSIS_ENTRIES.map((entry) => (
          <InfoCard key={entry.href} title={entry.title} subtitle={entry.href}>
            <p className="text-sm leading-7 text-slate-300">{entry.summary}</p>
            <p className="mt-4 text-sm">
              <Link className="text-sky-300 underline" href={entry.href}>
                Open analysis page
              </Link>
            </p>
          </InfoCard>
        ))}
      </section>
    </Shell>
  );
}
