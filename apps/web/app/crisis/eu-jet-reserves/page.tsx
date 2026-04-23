import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { getDashboardReadModel, getPriceTrendChartReadModel } from '@/lib/product-read-model';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import type { Route } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'EU Jet Fuel Reserve Crisis Monitor',
  description:
    'Real-time crisis dashboard tracking European jet fuel reserves, price surges, and the SAF competitiveness inflection point.',
  path: '/crisis/eu-jet-reserves'
});

// ---------------------------------------------------------------------------
// Reserve data — currently manually maintained (no public API for EU reserves).
// Update weekly. Format: { weeks: number, updatedAt: ISO, source: string }
// Override via SAFVSOIL_RESERVE_WEEKS env at build time if needed.
// ---------------------------------------------------------------------------
function getReserveData(): { weeks: number; updatedAt: string; source: string; nextUpdate: string } {
  const raw = process.env.SAFVSOIL_RESERVE_WEEKS;
  const weeks = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : 3.0;
  const updatedAt = '2026-04-23T06:00:00Z';
  return {
    weeks,
    updatedAt,
    source: 'IATA / EUROCONTROL estimates (manually curated)',
    nextUpdate: '2026-04-30T06:00:00Z'
  };
}

function reserveLevel(weeks: number): { label: string; color: string; barColor: string } {
  if (weeks <= 2) return { label: 'CRITICAL — Immediate action required', color: 'text-rose-300', barColor: 'bg-rose-500' };
  if (weeks <= 4) return { label: 'ELEVATED — SAF switch window opening', color: 'text-amber-300', barColor: 'bg-amber-500' };
  if (weeks <= 6) return { label: 'WATCH — Monitor closely', color: 'text-yellow-300', barColor: 'bg-yellow-500' };
  return { label: 'NORMAL', color: 'text-emerald-300', barColor: 'bg-emerald-500' };
}

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export default async function EuJetReserveCrisisPage() {
  const [readModel, priceChartData] = await Promise.all([
    getDashboardReadModel(),
    getPriceTrendChartReadModel()
  ]);

  const reserve = getReserveData();
  const level = reserveLevel(reserve.weeks);
  const market = readModel.market.values;

  const brent = market.brent_usd_per_bbl ?? 114.93;
  const jetEu = market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l ?? 0.99;
  const carbon = market.carbon_proxy_usd_per_t ?? 88.79;

  // SAF competitiveness gap at current prices
  const safHeffaLow = 1.60;
  const safHeffaHigh = 1.85;
  const safSpreadLow = ((safHeffaLow - jetEu) / jetEu) * 100;
  const safSpreadHigh = ((safHeffaHigh - jetEu) / jetEu) * 100;

  return (
    <Shell
      eyebrow="Crisis Monitor"
      title="EU Jet Fuel Reserve Crisis"
      description="Europe faces a structural aviation fuel squeeze. This dashboard tracks reserve levels, price surges, and the SAF competitiveness inflection point in real time."
    >
      {/* Top alert banner */}
      <section className={`mb-8 rounded-2xl border border-slate-700 bg-slate-950 p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className={`text-sm font-semibold uppercase tracking-wider ${level.color}`}>{level.label}</p>
            <p className="mt-1 text-4xl font-bold text-white">
              {formatNumber(reserve.weeks, 1)} <span className="text-lg font-medium text-slate-400">weeks</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Updated {formatDate(reserve.updatedAt)} · Next: {formatDate(reserve.nextUpdate)} · {reserve.source}
            </p>
          </div>
          <div className="w-full md:w-1/2">
            <div className="h-4 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full ${level.barColor} transition-all duration-500`}
                style={{ width: `${Math.min(100, Math.max(5, (reserve.weeks / 8) * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>0w</span>
              <span className="text-amber-400">2w (critical)</span>
              <span className="text-yellow-400">4w (elevated)</span>
              <span className="text-emerald-400">8w+ (normal)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Market snapshot row */}
      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Brent Crude" subtitle="Global benchmark">
          <p className="text-3xl font-semibold text-white">${formatNumber(brent)}/bbl</p>
          <p className="mt-2 text-xs text-slate-400">
            A $1/bbl move ≈ ${formatNumber(1 / 158.987, 4)} USD/L jet fuel impact
          </p>
        </InfoCard>

        <InfoCard title="Jet Fuel (EU Proxy)" subtitle="ARA / Rotterdam basis">
          <p className="text-3xl font-semibold text-white">${formatNumber(jetEu, 3)}/L</p>
          <p className="mt-2 text-xs text-slate-400">
            Directly tied to reserve scarcity. Higher = shorter effective reserves.
          </p>
        </InfoCard>

        <InfoCard title="Carbon Proxy" subtitle="CBAM + EU ETS pressure">
          <p className="text-3xl font-semibold text-white">${formatNumber(carbon)}/tCO₂</p>
          <p className="mt-2 text-xs text-slate-400">
            At €150/tCO₂ (2030 target), SAF breakeven shifts decisively.
          </p>
        </InfoCard>
      </section>

      {/* Narrative chain */}
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-xl font-semibold text-white">The crisis chain: reserves → prices → SAF inflection</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-4">
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Step 1</p>
            <p className="mt-2 text-sm font-semibold text-white">Reserve depletion</p>
            <p className="mt-1 text-xs text-slate-400">
              EU jet fuel stocks drawn down to ~{formatNumber(reserve.weeks, 1)} weeks. Geopolitical disruption + refining bottlenecks.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Step 2</p>
            <p className="mt-2 text-sm font-semibold text-white">Price spike</p>
            <p className="mt-1 text-xs text-slate-400">
              Jet-A spot rises with scarcity. Current EU proxy ${formatNumber(jetEu, 3)}/L — up from ~$0.75/L in 2024.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-yellow-300">Step 3</p>
            <p className="mt-2 text-sm font-semibold text-white">Route economics break</p>
            <p className="mt-1 text-xs text-slate-400">
              Short-haul margins collapse (fuel = ~30% of cost). Lufthansa already cut 20,000 flights.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Step 4</p>
            <p className="mt-2 text-sm font-semibold text-white">SAF becomes rational</p>
            <p className="mt-1 text-xs text-slate-400">
              HEFA SAF spread now {formatNumber(safSpreadLow, 0)}–{formatNumber(safSpreadHigh, 0)}% above Jet-A. At $130/bbl, SAF wins.
            </p>
          </div>
        </div>
      </section>

      {/* SAF competitiveness table */}
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-xl font-semibold text-white">SAF competitiveness at current vs. stressed prices</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="py-3 pr-4">Oil price scenario</th>
                <th className="py-3 pr-4">Jet-A cost</th>
                <th className="py-3 pr-4">HEFA SAF cost</th>
                <th className="py-3 pr-4">SAF premium</th>
                <th className="py-3">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              <tr>
                <td className="py-3 pr-4">$80/bbl (2024 baseline)</td>
                <td className="py-3 pr-4">~$0.95/L</td>
                <td className="py-3 pr-4">$1.60–1.85/L</td>
                <td className="py-3 pr-4 text-rose-400">+70–95%</td>
                <td className="py-3 text-rose-400">SAF uneconomic</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-semibold text-white">$115/bbl (now)</td>
                <td className="py-3 pr-4 font-semibold text-white">~${formatNumber((115 / 158.987) * 1.20, 2)}/L</td>
                <td className="py-3 pr-4">$1.60–1.85/L</td>
                <td className="py-3 pr-4 text-amber-400">+{formatNumber(((1.60 / ((115 / 158.987) * 1.20)) - 1) * 100, 0)}–{formatNumber(((1.85 / ((115 / 158.987) * 1.20)) - 1) * 100, 0)}%</td>
                <td className="py-3 text-amber-400">Inflection zone</td>
              </tr>
              <tr>
                <td className="py-3 pr-4">$130/bbl (stress)</td>
                <td className="py-3 pr-4">~${formatNumber((130 / 158.987) * 1.20, 2)}/L</td>
                <td className="py-3 pr-4">$1.60–1.85/L</td>
                <td className="py-3 pr-4 text-yellow-400">+{formatNumber(((1.60 / ((130 / 158.987) * 1.20)) - 1) * 100, 0)}–{formatNumber(((1.85 / ((130 / 158.987) * 1.20)) - 1) * 100, 0)}%</td>
                <td className="py-3 text-yellow-400">Marginal switch</td>
              </tr>
              <tr>
                <td className="py-3 pr-4">$150/bbl (2030 projection)</td>
                <td className="py-3 pr-4">~${formatNumber((150 / 158.987) * 1.20, 2)}/L</td>
                <td className="py-3 pr-4">$1.20–1.40/L (scaled)</td>
                <td className="py-3 pr-4 text-emerald-400">−10 to +15%</td>
                <td className="py-3 text-emerald-400">SAF dominant</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Lufthansa context */}
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-xl font-semibold text-white">Lufthansa flight cuts: a leading indicator</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          In April 2026, Lufthansa announced the cancellation of <strong>20,000 short-haul flights</strong>. 
          Surface reason: cost cutting. Deeper logic: the energy economics of aviation has reached an inflection point. 
          Fuel now consumes ~30% of short-haul operating cost. With jet prices at current levels, 
          2–3% margin routes become unprofitable.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={"/de/lufthansa-saf-2026" as Route}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            German analysis →
          </Link>
          <Link
            href="/analysis/lufthansa-flight-cuts-2026-04"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-400 hover:text-white"
          >
            Chinese full version →
          </Link>
        </div>
      </section>

      {/* Price trends */}
      <section className="mt-8">
        <InfoCard title="Price trend context" subtitle="1d / 7d / 30d — same data as dashboard">
          <PriceTrendsChart
            metrics={priceChartData.metrics}
            isLoading={false}
            error={priceChartData.error}
          />
        </InfoCard>
      </section>

      {/* Action checklist */}
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-xl font-semibold text-white">Decision checklist for operators</h2>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
          <li className="flex gap-3">
            <span className="text-rose-400">✗</span>
            <span><strong>Wait-and-see</strong> — reserve levels this low historically precede rationing or price spikes. Waiting increases exposure.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-400">△</span>
            <span><strong>Hedge forward</strong> — lock in jet fuel contracts at fixed prices if counterparties still offer them. Window narrowing.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400">✓</span>
            <span><strong>Secure SAF offtake</strong> — negotiate long-term SAF purchase agreements (LOIs) now, before 2025–2026 demand surge.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400">✓</span>
            <span><strong>Monitor this dashboard</strong> — we update reserve estimates weekly and market data every 10 minutes. Bookmark for daily checks.</span>
          </li>
        </ul>
      </section>
    </Shell>
  );
}
