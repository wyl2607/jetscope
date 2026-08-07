import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Deutschland',
  description: 'Indexierbare deutsche Startseite für JetScope mit Einstieg in Dashboard und Deutschland Jet-Fuel-Preisbeobachtung.',
  path: '/de'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
  );
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function stressTone(level?: string): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'elevated') return 'text-warning';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function eventTone(type?: string): string {
  if (type === 'CRITICAL') return 'text-danger';
  if (type === 'ALERT') return 'text-warning';
  if (type === 'CROSSOVER') return 'text-success';
  return 'text-warning';
}

function researchTone(status: string): string {
  if (status === 'error') return 'text-danger';
  if (status === 'not_found') return 'text-warning';
  return 'text-accent';
}

function reserveBasis(sourceType?: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

const entryCards: Array<{ title: string; description: string; href: Route }> = [
  { title: 'Dashboard (DE)', description: 'Live-Marktstatus, Szenario-Registry und Risikosignale für operative Entscheidungen.', href: '/de/dashboard' as Route },
  { title: 'Deutschland Jet-Fuel Preise', description: 'Serverseitige Preisbeobachtung für Brent, Jet global, EU-Jet-Proxy und Carbon-Proxy.', href: '/de/prices/germany-jet-fuel' as Route },
  { title: 'Quellenprüfung', description: 'Zeilenbasierte Prüfung von Live-, Proxy- und Fallback-Quellen.', href: '/de/sources' as Route },
  { title: 'Szenario-Workbench', description: 'Lesende Prüfung gespeicherter SAF-Annahmen mit Marktkontext.', href: '/de/scenarios' as Route },
  { title: 'Berichtswerkstatt', description: 'Deutsche Startprüfung für Quellenstatus, Szenarien und Berichtseinstiege.', href: '/de/reports' as Route },
  { title: 'Forschungswerkstatt', description: 'Prüfung der AI-Research-Pipeline mit ehrlicher Leer- oder Fehlerlage.', href: '/de/research' as Route },
  { title: 'Startbereitschaft', description: 'Lesende Prüfung von Datenbank, Quellenabdeckung und Backend-Bereitschaft.', href: '/de/admin' as Route },
  { title: 'Lufthansa-Analyse (DE)', description: 'Tiefenanalyse der Lufthansa-Flugkürzungen 2026 und des SAF-Wendepunkts.', href: '/de/lufthansa-saf-2026' as Route }
];

export default async function GermanIndexPage() {
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);
  const latestEvent = events[0] ?? null;
  const latestResearchSignal = signalsResult.signals.reduce<typeof signalsResult.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    const signalTime = signal.published_at == null ? Number.NEGATIVE_INFINITY : Date.parse(signal.published_at);
    const latestTime = latest.published_at == null ? Number.NEGATIVE_INFINITY : Date.parse(latest.published_at);
    return signalTime > latestTime ? signal : latest;
  }, null);
  const asOf = latestTimestamp([reserve?.generated_at, latestEvent?.observed_at, latestResearchSignal?.published_at]);

  return (
    <PageTemplate locale="de" eyebrow="Startseite · Deutsch" title="JetScope Deutschland" question="Kann JetScope meine Frage beantworten, und auf welcher Seite sollte ich beginnen?" asOf={asOf}>
      <SignalRow label="Einstieg und aktuelle Signale">
        <MetricCard label="Empfohlener Einstieg" value="Dashboard" hint="Mit dem Gesamtbild beginnen und danach in die passende Prüfung wechseln." cardHref="/de/dashboard" />
        <MetricCard label="Reserveabdeckung" value={reserve ? `${reserve.coverage_weeks.toFixed(2)} Wochen` : 'Nicht verfügbar'} valueClassName={stressTone(reserve?.stress_level)} hint="EU-Reservehaltung · /v1/reserves/eu" />
        <MetricCard label="Letztes Kippereignis" value={latestEvent?.event_type ?? 'Kein Ereignis'} valueClassName={eventTone(latestEvent?.event_type)} hint={`${events.length} Ereignisse im 42-Tage-Fenster · /v1/analysis/tipping-point/events`} />
        <MetricCard label="Forschungssignale" value={signalsResult.status === 'not_found' ? 'Nicht bereitgestellt' : signalsResult.status === 'error' ? 'Fehler' : `${signalsResult.signals.length} Signale`} valueClassName={researchTone(signalsResult.status)} hint="/v1/research/signals · gleiche Statuslogik wie die Forschungsseite" />
      </SignalRow>

      <Panel locale="de" title="Deutsche Einstiegspunkte" why="Jeder Einstieg beantwortet eine andere Prüfaufgabe; die bestehenden deutschen Inhalte und Routen bleiben getrennt erhalten.">
        <div className="grid gap-6 lg:grid-cols-3">
          {entryCards.map((card) => (
            <Link key={card.href} href={card.href} className="rounded-xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-accent-soft">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{card.href}</p>
              <h3 className="mt-2 text-lg font-medium text-ink">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted">{card.description}</p>
              <p className="mt-4 text-sm font-medium text-accent">Ansicht öffnen</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          { id: 'reserve-signal', label: `EU-Reserveabdeckung über ${reserve?.source_name ?? 'nicht verfügbare Quelle'}`, href: '/de/sources', asOf: reserve?.generated_at ?? null, basis: reserveBasis(reserve?.source_type) },
          { id: 'tipping-events', label: `SAF-Kipppunktereignisse (${events.length})`, href: '/de/reports/tipping-point-analysis', asOf: latestEvent?.observed_at ?? null, basis: 'observed' },
          { id: 'research-signals', label: `Abgeleitete Forschungssignale (${signalsResult.signals.length})`, href: '/de/research', asOf: latestResearchSignal?.published_at ?? null, basis: 'derived' }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          'Die Startseite ist eine Zusammenfassung und Navigation; vollständige Definitionen stehen auf den jeweiligen Detailseiten.',
          'Ein leeres Ereignisfenster bedeutet nicht, dass kein Risiko besteht.',
          'Forschungssignale sind abgeleitete Evidenz und keine direkte Marktbeobachtung.'
        ]}
      />
    </PageTemplate>
  );
}
