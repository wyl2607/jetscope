import { GermanyJetFuelMonitor } from '@/components/germany-jet-fuel-monitor';
import { PageTemplate } from '@/components/page-template';
import { germanyJetFuelCopy } from '@/lib/germany-jet-fuel-copy';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

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

export default async function EnglishGermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel('en'),
    getPriceTrendChartReadModel()
  ]);
  const observedAsOf = readModel.quoteAsOf ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;
  const copy = germanyJetFuelCopy.en;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Prices · Germany"
      title="Germany Jet-Fuel Price Monitor"
      question="Has Germany's current jet-fuel price moved far enough to revisit the contract or hedging decision?"
      asOf={asOf}
    >
      <GermanyJetFuelMonitor locale="en" copy={copy} initialReadModel={readModel} initialChart={priceChartData} />
    </PageTemplate>
  );
}
