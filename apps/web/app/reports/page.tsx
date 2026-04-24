import { Shell } from '@/components/shell';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildPageMetadata({
  title: 'Reports',
  description: 'JetScope portfolio report index for SAF tipping-point analysis.',
  path: '/reports'
});

const reports: Array<{ title: string; description: string; href: Route }> = [
  {
    title: 'The Tipping Point',
    description: 'A structured report shell connecting reserve stress, fuel economics, and airline decisions.',
    href: '/reports/tipping-point-analysis' as Route
  }
];

export default function ReportsPage() {
  return (
    <Shell
      eyebrow="Portfolio Reports"
      title="Reports"
      description="Recruiter-friendly written artifacts that explain the product thesis with live dashboard data."
    >
      <section className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-sky-500/60"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Featured report</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">{report.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">{report.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
