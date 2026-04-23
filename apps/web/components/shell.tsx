import type { Route } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/crisis/eu-jet-reserves', label: 'Crisis' },
  { href: '/scenarios', label: 'Scenarios' },
  { href: '/sources', label: 'Sources' },
  { href: '/admin', label: 'Admin' }
] as const;

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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-sky-300">SAFvsOil Product Scaffold</p>
            <h1 className="mt-1 text-xl font-semibold text-white">{title}</h1>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-300">
            {nav.map((item) => (
              <Link key={item.href} href={item.href as Route}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-sky-950/20">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">{title}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
        </section>
        {children}
      </main>
    </div>
  );
}
