import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope — SAF market intelligence',
  description:
    'Real-time jet fuel, carbon and SAF decision intelligence for European aviation. Live sources with provenance, crisis scenarios, and Lufthansa Q2 stress playbooks.',
  path: '/'
});

const locales = [
  {
    code: 'EN',
    href: '/dashboard' as Route,
    title: 'English cockpit',
    body: 'Dashboard, sources trust center, scenarios, crisis tools'
  },
  {
    code: 'DE',
    href: '/de' as Route,
    title: 'Deutsch',
    body: 'Deutschland-Fokus, Lufthansa SAF Analyse, Jetpreis DE'
  },
  {
    code: 'ZH',
    href: '/dashboard' as Route,
    title: '中文入口',
    body: '主控台与情景分析（界面以 EN/DE 产品页为主，数据同源）'
  }
] as const;

const pillars = [
  {
    href: '/dashboard' as Route,
    title: 'Live dashboard',
    body: 'Snapshot, Jet–Brent derived spread, refresh health, curated aviation events'
  },
  {
    href: '/sources' as Route,
    title: 'Trust center',
    body: 'As-of, lag, status, fallback and confidence for every core metric'
  },
  {
    href: '/crisis/saf-tipping-point' as Route,
    title: 'SAF tipping point',
    body: 'Interactive breakeven + airline decision matrix; LH Q2 2026 playbook'
  },
  {
    href: '/scenarios' as Route,
    title: 'Scenarios',
    body: 'Saved assumptions, transition readiness, registry-backed workflows'
  },
  {
    href: '/crisis/eu-jet-reserves' as Route,
    title: 'Reserve monitor',
    body: 'Curated EU reserve signal (not IATA live) + price pressure context'
  },
  {
    href: '/de/lufthansa-saf-2026' as Route,
    title: 'Lufthansa deep-dive',
    body: 'DE analysis page; ops facts as_of 2026-08-04 from curated article'
  }
] as const;

export default function IndexPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-300">JetScope</p>
            <p className="mt-1 text-sm text-slate-400">Sustainable aviation fuel · market intelligence</p>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-300">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/sources">Sources</Link>
            <Link href="/de">DE</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-sky-950/20 md:p-12">
          <p className="text-xs uppercase tracking-[0.22em] text-sky-300">V1 research product</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-white md:text-4xl">
            Real-time jet, carbon & SAF decision intelligence — with labeled provenance
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            JetScope aggregates public market proxies (Brent, jet, EU ETS/CBAM), shows source trust explicitly, and
            maps airline stress playbooks (e.g. Lufthansa Q2 2026) without inventing unpublished prices. Built for
            procurement research and policy scenario work — not a paid Platts terminal.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Open live dashboard
            </Link>
            <Link
              href="/sources"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-400"
            >
              Inspect sources
            </Link>
            <Link
              href="/crisis/saf-tipping-point?lh=1"
              className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-2 text-sm font-semibold text-amber-100 hover:border-amber-500"
            >
              LH Q2 2026 playbook
            </Link>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Locales</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {locales.map((item) => (
              <Link
                key={item.code}
                href={item.href}
                className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-sky-700/60"
              >
                <p className="text-xs font-semibold text-sky-300">{item.code}</p>
                <h3 className="mt-2 text-lg font-medium text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Product map</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pillars.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-emerald-700/50"
              >
                <h3 className="text-base font-medium text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/50 p-6 text-sm leading-7 text-slate-400">
          <p className="font-medium text-slate-200">Data honesty (V1)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Market prices come from public/proxy feeds or labeled seed fallback — never silent invention.</li>
            <li>Lufthansa figures are curated from the 2026-08-04 article JSON only.</li>
            <li>EU reserve days are curated/env; supply gap is null unless explicitly configured.</li>
            <li>Refresh health is exposed at <code className="text-sky-300">/v1/market/health</code>.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
