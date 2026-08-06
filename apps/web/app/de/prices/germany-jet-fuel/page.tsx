import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Deutschland Kerosinpreis',
  description:
    'Indexierbare serverseitig gerenderte Seite für Deutschland mit Brent, globalem Jet-Fuel, EU-Jet-Proxy, Carbon-Proxy und 1d/7d/30d-Änderung.',
  path: '/de/prices/germany-jet-fuel'
});

function formatMetricValue(value: number | null, digits: number, unit: string): string {
  if (!Number.isFinite(value ?? NaN)) return `n/a ${unit}`;
  return `${Number(value).toLocaleString('de-DE', {
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
  { href: '/de/sources?focus=brent_usd_per_bbl', label: 'Brent-Quellenstatus', key: 'brent_usd_per_bbl' },
  { href: '/de/sources?focus=jet_usd_per_l', label: 'Globaler Jet-Quellenstatus', key: 'jet_usd_per_l' },
  {
    href: '/de/sources?focus=jet_eu_proxy_usd_per_l',
    label: 'EU-Jet-Proxy-Quellenstatus',
    key: 'jet_eu_proxy_usd_per_l'
  },
  { href: '/de/sources?focus=carbon_proxy_usd_per_t', label: 'Carbon-Proxy-Quellenstatus', key: 'carbon_proxy_usd_per_t' }
] as const;

function decisionLabel(change: number | null, isFallback: boolean): string {
  if (isFallback || !Number.isFinite(change ?? NaN)) return 'Quelle prüfen';
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return 'Vertrag/Hedge prüfen';
  if (magnitude >= 10) return 'Prüfung nötig';
  return 'Noch kein Anlass';
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

export default async function GermanGermanyJetFuelPricePage() {
  const readModel = await getGermanyJetFuelReadModel('de');
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
      locale="de"
      eyebrow="Preise · Deutschland"
      title="Deutschland Jet-Fuel Preis-Monitor"
      question="Ist der aktuelle Deutschlandpreis für Jet-Fuel so weit abgewichen, dass Vertrag oder Hedging neu geprüft werden müssen?"
      asOf={asOf}
    >
      <SignalRow label="Deutschland Jet-Fuel Entscheidungssignale">
        <MetricCard
          label="Entscheidungsdruck"
          value={decisionLabel(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          valueClassName={decisionTone(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          hint={euJetMetric
            ? `EU-Jet-Proxy ${formatMetricValue(euJetMetric.value, euJetMetric.digits, euJetMetric.unit)} · 30T ${formatChange(euJetMetric.changePct30d)} · Status ${readModel.overallStatus}`
            : 'Für den EU-Jet-Proxy ist aktuell kein Wert verfügbar.'}
        />
        {signalMetrics.map((metric) => (
          <MetricCard
            key={metric.metricKey}
            label={metric.label}
            value={formatMetricValue(metric.value, metric.digits, metric.unit)}
            valueClassName={readModel.isFallback ? 'text-warning' : changeClass(metric.changePct30d)}
            hint={`1T ${formatChange(metric.changePct1d)} · 7T ${formatChange(metric.changePct7d)} · 30T ${formatChange(metric.changePct30d)}${metric.note ? ` · ${metric.note}` : ''}`}
          />
        ))}
      </SignalRow>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? `Deutschland-Jet-Fuel-Read-Model nicht verfügbar; Fallback-Schätzungen werden verwendet (${readModel.error ?? 'unbekannter Grund'})`
              : 'Deutschland-Jet-Fuel-Read-Model (Brent, Jet-Fuel, EU-Jet-Proxy und Carbon-Proxy)',
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
        methodHref="/de/sources"
        methodLabel="Methode für Quellen und Preisbewegungen"
        limitations={[
          'Jet-Fuel-Preise sind Proxies und können von standortspezifischen Vertragswerten in Deutschland abweichen.',
          'Der EU-Jet-Proxy kann bei Datenfeed-Ausfall vorübergehend auf die globale Jet-Serie zurückfallen; ein Fallback ist keine Messung.',
          'Der Carbon-Proxy zeigt Richtlinien-Kostendruck und muss mit Route und Beimischungsannahmen gelesen werden.',
          'Diese Seite unterstützt Entscheidungen, ist aber kein Ausführungsfeed; Beschaffungsentscheidungen müssen gegen Lieferantenangebote geprüft werden.'
        ]}
      />
    </PageTemplate>
  );
}
