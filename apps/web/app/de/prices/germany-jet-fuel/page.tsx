import { GermanyJetFuelMonitor, type GermanyJetFuelCopy } from '@/components/germany-jet-fuel-monitor';
import { PageTemplate } from '@/components/page-template';
import { SourceFooter } from '@/components/source-footer';
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

const sourceLinks = [
  { href: '/de/sources?focus=brent_usd_per_bbl', label: 'Brent-Quellenstatus', key: 'brent_usd_per_bbl' },
  { href: '/de/sources?focus=jet_usd_per_l', label: 'Globaler Jet-Quellenstatus', key: 'jet_usd_per_l' },
  {
    href: '/de/sources?focus=jet_eu_proxy_usd_per_l',
    label: 'EU-Jet-Proxy-Quellenstatus',
    key: 'jet_eu_proxy_usd_per_l'
  },
  { href: '/de/sources?focus=carbon_proxy_usd_per_t', label: 'Carbon-Proxy-Quellenstatus', key: 'carbon_proxy_usd_per_t' }
] as const;

const copy: GermanyJetFuelCopy = {
  signalLabel: 'Deutschland Jet-Fuel Entscheidungssignale',
  decisionLabel: 'Entscheidungsdruck',
  decisions: {
    insufficient: 'Historie unzureichend',
    revisit: 'Vertrag/Hedge prüfen',
    review: 'Prüfung nötig',
    stable: 'Noch kein Anlass'
  },
  historyMissing: 'Historie unzureichend',
  quoteDate: 'Notierungsdatum',
  lastCheck: 'Letzte Prüfung',
  staleKeep: 'Aktualisierung fehlgeschlagen, letzte gültige Notierung bleibt stehen',
  costTitle: 'Marktgekoppelte Kostenschätzung',
  costWhy: 'Ohne Flughafen-Into-plane-Preis und Airline-Rechnung schätzen wir nur Kraftstoff- und Compliance-Kosten.',
  estimateBanner: 'Das ist eine marktgekoppelte Kostenschätzung, keine Airline-Rechnung.',
  airportLabel: 'Streckenvorlage',
  fuelKgLabel: 'Verbrauch kg',
  paxLabel: 'Passagiere',
  blendLabel: 'SAF-Beimischung %',
  airportDiffLabel: 'Flughafen-Differenz EUR/t (offen)',
  taxUseLabel: 'Steuerliche Nutzung',
  taxCommercial: 'Kommerziell (in der Regel steuerfrei)',
  taxPrivate: 'Privat (Energiesteuer-Szenario)',
  perFlight: 'Je Flug Kraftstoff+Compliance',
  perPax: 'Je Passagier',
  delivered: 'Delivered-Schätzung',
  noAirportQuote: 'Deutsche Flughafen-Differenz fehlt; kein gemessener Into-plane-Preis.',
  methodLabel: 'Methode für Quellen und Preisbewegungen',
  limitations: [
    'Jet-Fuel-Preise sind Proxies und können von standortspezifischen Vertragswerten in Deutschland abweichen.',
    'Der EU-Jet-Proxy kann bei Datenfeed-Ausfall vorübergehend auf die globale Jet-Serie zurückfallen; ein Fallback ist keine Messung.',
    'Der Carbon-Proxy zeigt Richtlinien-Kostendruck und muss mit Route und Beimischungsannahmen gelesen werden.',
    'Diese Seite unterstützt Entscheidungen, ist aber kein Ausführungsfeed; Beschaffungsentscheidungen müssen gegen Lieferantenangebote geprüft werden.',
    'Ohne Nicht-Kraftstoffkosten gibt es keine Darstellung der gesamten Flugbetriebskosten.'
  ]
};

export default async function GermanGermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel('de'),
    getPriceTrendChartReadModel()
  ]);
  const observedAsOf = readModel.quoteAsOf ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Preise · Deutschland"
      title="Deutschland Jet-Fuel Preis-Monitor"
      question="Ist der aktuelle Deutschlandpreis für Jet-Fuel so weit abgewichen, dass Vertrag oder Hedging neu geprüft werden müssen?"
      asOf={asOf}
    >
      <GermanyJetFuelMonitor locale="de" copy={copy} initialReadModel={readModel} initialChart={priceChartData} />
      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? `Deutschland-Jet-Fuel-Read-Model nicht verfügbar; Fallback-Schätzungen werden verwendet (${readModel.error ?? 'unbekannter Grund'})`
              : 'Deutschland-Jet-Fuel-Read-Model (Brent, Jet-Fuel, EU-Jet-Proxy und Carbon-Proxy)',
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
        methodHref="/de/sources"
        methodLabel="Methode für Quellen und Preisbewegungen"
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
