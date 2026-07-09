import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import type { Metadata } from 'next';
import Link from 'next/link';
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
  return date.toLocaleString('de-DE');
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

function sourceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ok: 'OK',
    degraded: 'eingeschränkt',
    offline: 'offline',
    unknown: 'unbekannt'
  };
  return labels[status] ?? status;
}

export default async function GermanGermanyJetFuelPricePage() {
  const readModel = await getGermanyJetFuelReadModel('de');

  return (
    <Shell
      locale="de"
      eyebrow="Preise · Deutschland"
      title="Deutschland Jet-Fuel Preis-Monitor"
      description="Serverseitig gerenderte Marktseite für Deutschland. Zeigt Brent, globales Jet-Fuel, EU-Jet-Proxy und Carbon-Proxy mit 1d/7d/30d-Änderungsfenstern."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {readModel.metrics.map((metric) => (
          <InfoCard
            key={metric.metricKey}
            title={metric.label}
            subtitle={`Stand: ${formatAsOf(metric.latestAsOf)} | Status: ${sourceStatusLabel(readModel.overallStatus)}`}
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

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <InfoCard title="Risikohinweis" subtitle="Entscheidungsunterstützung, kein Ausführungsfeed">
          <ul className="space-y-2 text-sm leading-7 text-slate-300">
            <li>• Jet-Preise sind Proxies und können von standortspezifischen Vertragswerten in Deutschland abweichen.</li>
            <li>• Der EU-Jet-Proxy kann bei Datenfeed-Ausfall vorübergehend auf die globale Jet-Serie zurückfallen.</li>
            <li>• Carbon-Proxy zeigt Richtlinien-Kostendruck und muss mit Route und Beimischungsannahmen gelesen werden.</li>
            <li>• Für Beschaffungsentscheidungen bitte immer gegen Lieferantenangebote abgleichen.</li>
          </ul>
        </InfoCard>

        <InfoCard title="Quellen" subtitle="Jede Metrik mit Herkunft prüfbar">
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
            Erstellt: {new Date(readModel.generatedAt).toLocaleString('de-DE')}
            {readModel.isFallback && readModel.error ? ` | Fallback wegen: ${readModel.error}` : ''}
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
