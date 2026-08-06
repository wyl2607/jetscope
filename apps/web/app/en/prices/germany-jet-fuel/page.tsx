import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';

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
  if (!Number.isFinite(value ?? NaN)) return 'text-warning';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
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

function decisionLabel(change: number | null, isFallback: boolean): string {
  if (isFallback || !Number.isFinite(change ?? NaN)) return 'Review source first';
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return 'Revisit contract/hedge';
  if (magnitude >= 10) return 'Review needed';
  return 'No trigger yet';
}

function decisionTone(change: number | null, isFallback: boolean): string {
  if (isFallback || !Number.isFinite(change ?? NaN)) return 'text-danger';
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
}

function sourceBasis(sourceKey: string, isFallback: boolean): SourceRef['basis'] {
  if (isFallback) return 'assumption';
  // The price read model does not expose source_type. Proxy keys are explicit;
  // every other unmapped source follows the contract's assumption default.
  return sourceKey.includes('proxy') ? 'derived' : 'assumption';
}

export default async function EnglishGermanyJetFuelPricePage() {
  const readModel = await getGermanyJetFuelReadModel('en');
  const euJetMetric = readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l') ?? readModel.metrics[0];
  const signalMetrics = readModel.metrics.filter((metric) => metric.metricKey !== euJetMetric?.metricKey).slice(0, 3);
  const observedAsOf = readModel.metrics
    .map((metric) => metric.latestAsOf)
    .filter((value): value is string => value !== null && !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
    .pop() ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Prices · Germany"
      title="Germany Jet-Fuel Price Monitor"
      question="Has Germany's current jet-fuel price moved far enough to revisit the contract or hedging decision?"
      asOf={asOf}
    >
      <SignalRow label="Germany jet-fuel decision signals">
        <MetricCard
          label="Decision pressure"
          value={decisionLabel(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          valueClassName={decisionTone(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          hint={euJetMetric
            ? `EU jet proxy ${formatMetricValue(euJetMetric.value, euJetMetric.digits, euJetMetric.unit)} · 30d ${formatChange(euJetMetric.changePct30d)} · Status ${readModel.overallStatus}`
            : 'The EU jet proxy has no current value.'}
        />
        {signalMetrics.map((metric) => (
          <MetricCard
            key={metric.metricKey}
            label={metric.label}
            value={formatMetricValue(metric.value, metric.digits, metric.unit)}
            valueClassName={readModel.isFallback ? 'text-warning' : changeClass(metric.changePct30d)}
            hint={`1d ${formatChange(metric.changePct1d)} · 7d ${formatChange(metric.changePct7d)} · 30d ${formatChange(metric.changePct30d)}${metric.note ? ` · ${metric.note}` : ''}`}
          />
        ))}
      </SignalRow>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? `Germany jet-fuel read model unavailable; fallback estimates are in use (${readModel.error ?? 'unknown reason'})`
              : 'Source Review: Germany jet-fuel read model (Brent, global jet fuel, EU jet proxy, and carbon proxy)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          ...sourceLinks.map((source) => ({
            id: source.key,
            label: source.label,
            href: source.href,
            asOf: readModel.isFallback
              ? null
              : readModel.metrics.find((metric) => metric.metricKey === source.key)?.latestAsOf ?? null,
            basis: sourceBasis(source.key, readModel.isFallback)
          }))
        ]}
        methodHref="/en/sources"
        methodLabel="Source and price-movement method"
        limitations={[
          'Jet-fuel prices are proxies and may differ from airport-specific or contract-settled prices in Germany.',
          'The EU jet proxy can temporarily fall back to the global jet-fuel series when regional data is unavailable; a fallback is not a measurement.',
          'The carbon proxy reflects policy-cost pressure and should be read with route and blend assumptions.',
          'Decision support, not a trading feed. Compare procurement action with supplier quotes and internal contract terms.'
        ]}
      />
    </PageTemplate>
  );
}
