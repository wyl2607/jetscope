import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { getGermanyJetFuelReadModel, getPriceTrendChartReadModel } from '@/lib/product-read-model';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Germany Jet Fuel Price',
  description:
    'Indexable SSR view of Germany jet fuel proxies with Brent, global jet fuel, EU jet proxy, carbon proxy, and 1d/7d/30d market changes.',
  path: '/prices/germany-jet-fuel'
});

function formatMetricValue(value: number | null, digits: number, unit: string): string {
  if (!Number.isFinite(value ?? NaN)) return `n/a ${unit}`;
  return `${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} ${unit}`;
}

function formatChange(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function changeClass(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'text-slate-400';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-rose-300';
  if (magnitude >= 10) return 'text-amber-300';
  return 'text-emerald-300';
}

function formatAsOf(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

const sourceLinks = [
  { href: '/sources?focus=brent_usd_per_bbl', label: 'Brent source status', key: 'brent_usd_per_bbl' },
  { href: '/sources?focus=jet_usd_per_l', label: 'Global jet source status', key: 'jet_usd_per_l' },
  {
    href: '/sources?focus=jet_eu_proxy_usd_per_l',
    label: 'EU jet proxy source status',
    key: 'jet_eu_proxy_usd_per_l'
  },
  { href: '/sources?focus=carbon_proxy_usd_per_t', label: 'Carbon proxy source status', key: 'carbon_proxy_usd_per_t' }
] as const;

export default async function GermanyJetFuelPricePage() {
  const readModel = await getGermanyJetFuelReadModel();
  const priceChartData = await getPriceTrendChartReadModel();

  return (
    <Shell
      eyebrow="Prices · Germany"
      title="Germany jet fuel price monitor"
      description="SSR market page for Germany operations. Uses live snapshot + history to expose Brent, global jet, EU jet proxy, and carbon proxy with 1d/7d/30d change windows."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {readModel.metrics.map((metric) => (
          <InfoCard
            key={metric.metricKey}
            title={metric.label}
            subtitle={`as_of=${formatAsOf(metric.latestAsOf)} | status=${readModel.overallStatus}`}
          >
            <p className="text-3xl font-semibold text-white">{formatMetricValue(metric.value, metric.digits, metric.unit)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-slate-500">1d</p>
                <p className={changeClass(metric.changePct1d)}>{formatChange(metric.changePct1d)}</p>
              </div>
              <div>
                <p className="text-slate-500">7d</p>
                <p className={changeClass(metric.changePct7d)}>{formatChange(metric.changePct7d)}</p>
              </div>
              <div>
                <p className="text-slate-500">30d</p>
                <p className={changeClass(metric.changePct30d)}>{formatChange(metric.changePct30d)}</p>
              </div>
            </div>
            {metric.note ? <p className="mt-3 text-xs text-amber-300">{metric.note}</p> : null}
          </InfoCard>
        ))}
      </section>

      <section className="mt-8">
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <InfoCard title="Risk statement" subtitle="For decision support, not trade execution">
          <ul className="space-y-2 text-sm leading-7 text-slate-300">
            <li>• Jet prices are proxies and may diverge from airport-specific contract settlements in Germany.</li>
            <li>• EU jet proxy may temporarily fallback to global jet series when regional feed is unavailable.</li>
            <li>• Carbon proxy tracks policy cost pressure and should be interpreted with route and blending assumptions.</li>
            <li>• For procurement decisions, cross-check this dashboard with contracted supplier quotes.</li>
          </ul>
        </InfoCard>

        <InfoCard title="Sources" subtitle="Trace each metric to provenance details">
          <ul className="space-y-3 text-sm text-slate-300">
            {sourceLinks.map((source) => (
              <li key={source.key}>
                <Link className="underline decoration-sky-500/40 hover:decoration-sky-300" href={source.href}>
                  {source.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            generated_at: {new Date(readModel.generatedAt).toLocaleString()}
            {readModel.isFallback && readModel.error ? ` | fallback due to ${readModel.error}` : ''}
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
