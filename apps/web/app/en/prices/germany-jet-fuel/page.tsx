import { GermanyJetFuelMonitor, type GermanyJetFuelCopy } from '@/components/germany-jet-fuel-monitor';
import { PageTemplate } from '@/components/page-template';
import { SourceFooter } from '@/components/source-footer';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
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

const copy: GermanyJetFuelCopy = {
  signalLabel: 'Germany jet-fuel decision signals',
  decisionLabel: 'Decision pressure',
  decisions: {
    insufficient: 'Insufficient history',
    revisit: 'Revisit contract/hedge',
    review: 'Review needed',
    stable: 'No trigger yet'
  },
  historyMissing: 'Insufficient history',
  quoteDate: 'Quote date',
  lastCheck: 'Last check',
  staleKeep: 'Refresh failed; keeping the last valid quote',
  costTitle: 'Market-linked cost estimate',
  costWhy: 'Without an airport into-plane quote and airline invoice, this only estimates fuel and compliance cost.',
  estimateBanner: 'This is a market-linked cost estimate, not an airline invoice.',
  airportLabel: 'Route preset',
  fuelKgLabel: 'Fuel burn kg',
  paxLabel: 'Passengers',
  blendLabel: 'SAF blend %',
  airportDiffLabel: 'Airport differential EUR/t (pending)',
  taxUseLabel: 'Tax use',
  taxCommercial: 'Commercial (typically exempt)',
  taxPrivate: 'Private (energy-tax scenario)',
  perFlight: 'Fuel + compliance / flight',
  perPax: 'Per passenger',
  delivered: 'Delivered estimate',
  noAirportQuote: 'German airport differential pending; no measured into-plane price.',
  methodLabel: 'Source and price-movement method',
  limitations: [
    'Jet-fuel prices are proxies and may differ from airport-specific or contract-settled prices in Germany.',
    'The EU jet proxy can temporarily fall back to the global jet-fuel series when regional data is unavailable; a fallback is not a measurement.',
    'The carbon proxy reflects policy-cost pressure and should be read with route and blend assumptions.',
    'Decision support, not a trading feed. Compare procurement action with supplier quotes and internal contract terms.',
    'Non-fuel operating costs are not covered, so this page does not show total flight operating cost.'
  ]
};

export default async function EnglishGermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel('en'),
    getPriceTrendChartReadModel()
  ]);
  const observedAsOf = readModel.quoteAsOf ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Prices · Germany"
      title="Germany Jet-Fuel Price Monitor"
      question="Has Germany's current jet-fuel price moved far enough to revisit the contract or hedging decision?"
      asOf={asOf}
    >
      <GermanyJetFuelMonitor locale="en" copy={copy} initialReadModel={readModel} initialChart={priceChartData} />
      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? `Germany jet-fuel read model unavailable; fallback estimates are in use (${readModel.error ?? 'unknown reason'})`
              : 'Source Review: Germany jet-fuel read model (Brent, global jet fuel, EU jet proxy, and carbon proxy)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : ('derived' as const)
          },
          ...sourceLinks.map((source) => ({
            id: source.key,
            label: source.label,
            href: source.href,
            asOf: readModel.isFallback
              ? null
              : readModel.metrics.find((metric) => metric.metricKey === source.key)?.observedAt ?? null,
            basis: readModel.isFallback ? ('assumption' as const) : ('derived' as const)
          }))
        ]}
        methodHref="/en/sources"
        methodLabel="Source and price-movement method"
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
