import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Germany Jet-Fuel Price Monitor',
  description:
    'English Germany jet-fuel market view for Brent, global jet fuel, EU jet proxy, carbon proxy, and 1d/7d/30d source-backed changes.',
  path: '/en/prices/germany-jet-fuel',
  alternateLanguages: {
    'zh-CN': '/prices/germany-jet-fuel',
    de: '/de/prices/germany-jet-fuel',
    en: '/en/prices/germany-jet-fuel'
  }
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
  if (!Number.isFinite(value ?? NaN)) return 'text-slate-500';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-rose-700';
  if (magnitude >= 10) return 'text-amber-700';
  return 'text-emerald-700';
}

function formatAsOf(value: string | null): string {
  if (!value) return 'not yet verified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not yet verified';
  return date.toLocaleString('en-US');
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'healthy';
  if (status === 'degraded') return 'degraded';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unknown';
  return status;
}

const sourceLinks = [
  { href: '/en/sources?focus=brent_usd_per_bbl', label: 'Brent source status', key: 'brent_usd_per_bbl' },
  { href: '/en/sources?focus=jet_usd_per_l', label: 'Global jet-fuel source status', key: 'jet_usd_per_l' },
  {
    href: '/en/sources?focus=jet_eu_proxy_usd_per_l',
    label: 'EU jet proxy source status',
    key: 'jet_eu_proxy_usd_per_l'
  },
  { href: '/en/sources?focus=carbon_proxy_usd_per_t', label: 'Carbon proxy source status', key: 'carbon_proxy_usd_per_t' }
] as const satisfies readonly { href: Route; label: string; key: string }[];

export default async function EnglishGermanyJetFuelPricePage() {
  const readModel = await getGermanyJetFuelReadModel('en');

  return (
    <Shell
      locale="en"
      eyebrow="Prices · Germany"
      title="Germany Jet-Fuel Price Monitor"
      description="A source-aware market view for Germany: Brent, global jet fuel, EU jet proxy, and carbon proxy with short-window market movement."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {readModel.metrics.map((metric) => (
          <InfoCard
            key={metric.metricKey}
            title={metric.label}
            subtitle={`As of ${formatAsOf(metric.latestAsOf)} | Source status: ${sourceStatusLabel(readModel.overallStatus)}`}
          >
            <p className="text-3xl font-semibold text-slate-950">{formatMetricValue(metric.value, metric.digits, metric.unit)}</p>
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
            {metric.note ? <p className="mt-3 text-xs text-amber-700">{metric.note}</p> : null}
          </InfoCard>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <InfoCard title="Risk Note" subtitle="Decision support, not a trading feed">
          <ul className="space-y-2 text-sm leading-7 text-slate-700">
            <li>Jet-fuel prices are proxies and may differ from airport-specific or contract-settled prices in Germany.</li>
            <li>The EU jet proxy can temporarily fall back to the global jet-fuel series when regional data is unavailable.</li>
            <li>The carbon proxy reflects policy-cost pressure and should be read with route and blend assumptions.</li>
            <li>For procurement action, compare this surface with supplier quotes and internal contract terms.</li>
          </ul>
        </InfoCard>

        <InfoCard title="Source Review" subtitle="Every metric links to source provenance">
          <ul className="space-y-3 text-sm text-slate-700">
            {sourceLinks.map((source) => (
              <li key={source.key}>
                <Link className="font-semibold text-sky-700 underline decoration-sky-500/40 hover:decoration-sky-400" href={source.href}>
                  {source.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Generated at {new Date(readModel.generatedAt).toLocaleString('en-US')}
            {readModel.isFallback && readModel.error ? ` | Fallback because: ${readModel.error}` : ''}
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
