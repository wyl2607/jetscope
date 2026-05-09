import { Shell } from '@/components/shell';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildPageMetadata({
  title: '报告',
  description: 'JetScope SAF 临界点分析的组合报告索引。',
  path: '/reports'
});

const reports: Array<{ title: string; description: string; href: Route }> = [
  {
    title: '临界点报告',
    description: '结构化报告框架，串联储备压力、燃料经济性与航司决策。',
    href: '/reports/tipping-point-analysis' as Route
  }
];

export default function ReportsPage() {
  return (
    <Shell
      eyebrow="组合报告"
      title="报告"
      description="用实时驾驶舱数据解释产品论点的专业书面材料。"
    >
      <section className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-sky-500/60"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-sky-300">精选报告</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{report.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">{report.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
