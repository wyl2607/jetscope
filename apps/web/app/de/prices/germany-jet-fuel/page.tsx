import { GermanyJetFuelMonitor } from '@/components/germany-jet-fuel-monitor';
import { PageTemplate } from '@/components/page-template';
import { germanyJetFuelCopy } from '@/lib/germany-jet-fuel-copy';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Deutschland Kerosinpreis',
  description:
    'Indexierbare serverseitig gerenderte Seite für Deutschland mit Brent, globalem Jet-Fuel, EU-Jet-Proxy, Carbon-Proxy und 1d/7d/30d-Änderung.',
  path: '/de/prices/germany-jet-fuel'
});

export default async function GermanGermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel('de'),
    getPriceTrendChartReadModel()
  ]);
  const observedAsOf = readModel.quoteAsOf ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;
  const copy = germanyJetFuelCopy.de;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Preise · Deutschland"
      title="Deutschland Jet-Fuel Preis-Monitor"
      question="Ist der aktuelle Deutschlandpreis für Jet-Fuel so weit abgewichen, dass Vertrag oder Hedging neu geprüft werden müssen?"
      asOf={asOf}
    >
      <GermanyJetFuelMonitor locale="de" copy={copy} initialReadModel={readModel} initialChart={priceChartData} />
    </PageTemplate>
  );
}
