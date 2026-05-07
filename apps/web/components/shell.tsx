import type { Route } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';

const nav = [
  { href: '/dashboard', label: '决策驾驶舱' },
  { href: '/crisis', label: '危机监测' },
  { href: '/scenarios', label: '情景推演' },
  { href: '/research', label: '研究信号' },
  { href: '/reports', label: '分析报告' },
  { href: '/sources', label: '数据来源' },
  { href: '/admin', label: '管理' }
] as const;

const primaryNav = nav.slice(0, 4);
const secondaryNav = nav.slice(4);

export function Shell({
  title,
  eyebrow,
  description,
  children
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="jetscope-workbench min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <Link href="/" className="text-xs uppercase tracking-[0.22em] text-sky-300">
              JetScope
            </Link>
            <p className="mt-1 truncate text-lg font-semibold text-white md:text-xl">{title}</p>
          </div>
          <nav aria-label="主导航" className="-mx-1 flex gap-1 overflow-x-auto pb-1 text-sm text-slate-300 md:mx-0 md:flex-wrap md:justify-end md:overflow-visible md:pb-0">
            {[...primaryNav, ...secondaryNav].map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="shrink-0 rounded-full px-3 py-1.5 transition hover:bg-slate-800 hover:text-sky-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-sky-950/20 md:rounded-3xl md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">{title}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
        </section>
        {children}
      </main>
    </div>
  );
}
