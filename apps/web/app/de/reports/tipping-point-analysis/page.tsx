import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { AI_RESEARCH_ENABLED, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Kipppunktbericht',
  description:
    'Deutscher JetScope-Berichtsdetailblick für SAF-Kipppunkt, Quellenvertrauen, Reservestress und Forschungsstatus.',
  path: '/de/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return Number(value).toLocaleString('de-DE', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatPrice(value: number | null | undefined): string {
  return `${formatNumber(value, 3)} USD/L`;
}

function formatPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'gesund';
  if (status === 'degraded') return 'eingeschränkt';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unbekannt';
  return status;
}

function researchPosture(status: string, count: number): string {
  if (!AI_RESEARCH_ENABLED) return 'deaktivierte Grenze';
  if (status === 'error') return 'eingeschränkt';
  if (status === 'not_found') return 'nicht bereitgestellt';
  return count > 0 ? 'mit Signalen belegt' : 'wartet auf Signale';
}

function signalTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-danger';
  return 'text-warning';
}

function probabilityTone(probability: number): string {
  if (probability >= 67) return 'text-success';
  if (probability >= 34) return 'text-warning';
  return 'text-danger';
}

export default async function GermanTippingPointReportPage() {
  const [readModel, reserve, events, research] = await Promise.all([
    getDashboardReadModel('de'),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 }),
    getResearchSignals()
  ]);
  const sourceStatus = readModel.market.source_status;
  const tippingPoint = readModel.tippingPoint;
  const decision = readModel.airlineDecision;
  const latestEvent = events[0] ?? null;
  const fossilJetSource = tippingPoint?.effective_fossil_jet_usd_per_l != null
    ? 'model'
    : readModel.market.values.jet_eu_proxy_usd_per_l != null
      ? 'proxy'
      : readModel.market.values.jet_usd_per_l != null
        ? 'spot'
        : 'assumed';
  const fossilPrice =
    tippingPoint?.effective_fossil_jet_usd_per_l ??
    readModel.market.values.jet_eu_proxy_usd_per_l ??
    readModel.market.values.jet_usd_per_l;
  const switchProbability = Math.round(
    Math.max(
      decision?.probabilities.buy_spot_saf ?? 0,
      decision?.probabilities.sign_long_term_offtake ?? 0
    ) * 100
  );
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(research.status, research.signals.length);
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Berichtsdetail"
      title="Kipppunktbericht"
      question="Trägt die wirtschaftliche These dieses Berichts noch?"
      asOf={asOf}
    >
      <SignalRow label="Kipppunkt-Fazit">
        <MetricCard
          label="Kipppunkt-Signal"
          value={tippingPoint?.signal ?? 'Prüfung'}
          valueClassName={signalTone(tippingPoint?.signal)}
          hint="Das Fazit zuerst; ein unbekanntes Signal bleibt prüfpflichtig."
        />
        <MetricCard
          label="Entscheidungswahrscheinlichkeit"
          value={`${switchProbability}%`}
          valueClassName={probabilityTone(switchProbability)}
          hint="Höchster Wert aus Spot-SAF-Kauf und langfristiger Abnahme."
        />
        <MetricCard
          label="Quellenvertrauen"
          value={sourceConfidence}
          hint={`Marktstatus: ${sourceStatusLabel(sourceStatus.overall)}`}
        />
        <MetricCard
          label="Geladene Ereignisse"
          value={`${events.length}`}
          valueClassName="text-ink"
          hint={latestEvent ? `Zuletzt: ${latestEvent.event_type.toLowerCase()}` : 'Keine Ereignisse im aktuellen Prüffenster.'}
        />
      </SignalRow>

      <Panel
        locale="de"
        title="Kernthese"
        why="Die Evidenzkette zeigt, ob das Modell als Entscheidungsgrundlage taugt oder zuerst in die Quellenprüfung muss."
      >
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>
            JetScope behandelt den Kipppunkt als Zusammenlaufen von fossilen Kraftstoffkosten, Kohlenstoffexponierung,
            Reservestress und SAF-Pfadabstand. Der aktuelle fossile Kostenanker liegt bei{' '}
            <strong className="tabular-nums text-ink">{formatPrice(fossilPrice)}</strong>.
          </p>
          <p>
            Der Quellenstatus ist <strong className="text-ink">{sourceStatusLabel(sourceStatus.overall)}</strong> mit{' '}
            <strong className="tabular-nums text-ink">{sourceConfidence}</strong> Vertrauen. Bei Fallback-Zeilen bleibt der
            Bericht lesbar, muss aber vor Veröffentlichung geprüft werden.
          </p>
        </div>
      </Panel>

      <Panel
        locale="de"
        title="Quellenvertrauen"
        why="Diese vier Angaben erklären, wie belastbar das Fazit ist und welche Evidenz noch fehlt."
      >
        <dl className="space-y-3 text-sm text-muted">
          <div className="flex items-center justify-between gap-4">
            <dt>Marktstatus</dt>
            <dd className="font-medium text-ink">{sourceStatusLabel(sourceStatus.overall)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Fallback-Rate</dt>
            <dd className="font-medium tabular-nums text-ink">{formatPercent(sourceStatus.fallback_rate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Letztes Ereignis</dt>
            <dd className="font-medium text-ink">{latestEvent ? latestEvent.event_type.toLowerCase() : 'keins'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Forschungsstatus</dt>
            <dd className="font-medium text-ink">{researchStatus}</dd>
          </div>
        </dl>
      </Panel>

      <Panel
        locale="de"
        title="Nächste Prüfschritte"
        why="Die Berichtsthese wird erst nutzbar, wenn Quellen, Szenarioannahmen und Veröffentlichungspfad erreichbar bleiben."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            {
              title: 'Quellen prüfen',
              description: 'Live-, Proxy-, Fallback- und eingeschränkte Eingaben vor externer Nutzung prüfen.',
              href: '/de/sources?filter=review' as Route
            },
            {
              title: 'Szenarioannahmen vergleichen',
              description: 'Gespeicherte Annahmen prüfen, bevor sich die Beschaffungshaltung ändert.',
              href: '/de/scenarios' as Route
            },
            {
              title: 'Zur Berichtswerkstatt',
              description: 'Startposition und Berichtskatalog auf der Übersicht erneut prüfen.',
              href: '/de/reports' as Route
            }
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-medium text-ink">{action.title}</p>
              <p className="mt-2 text-sm leading-7 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'dashboard-read-model',
            label: 'Dashboard-Read-Model und Marktstatus',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'reserve-signal',
            label: `EU-Reserveabdeckung über ${reserve?.source_name ?? 'nicht verfügbare Quelle'}`,
            asOf: reserve?.generated_at ?? null,
            basis: reserve?.source_type === 'official' ? 'observed' : reserve?.source_type === 'derived' ? 'derived' : 'assumption'
          },
          {
            id: 'report-fossil-anchor',
            label: fossilJetSource === 'assumed' ? 'Kein fossiler Kostenanker verfügbar' : 'Fossiler Jet-Fuel-Kostenanker',
            asOf,
            basis: readModel.isFallback ? 'assumption' : fossilJetSource === 'spot' ? 'observed' : fossilJetSource === 'assumed' ? 'assumption' : 'derived'
          },
          {
            id: 'tipping-events',
            label: `SAF-Kipppunktereignisse (${events.length})`,
            asOf: latestEvent?.observed_at ?? null,
            basis: 'observed'
          },
          {
            id: 'research-signals',
            label: `Abgeleitete Forschungssignale (${research.signals.length})`,
            asOf: research.signals[0]?.published_at ?? null,
            basis: 'derived'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          'Der Bericht beschreibt marktweite Schwellen, nicht Verträge, Vorräte oder Freigaben einer einzelnen Airline.',
          'Entscheidungswahrscheinlichkeiten sind Modellergebnisse und keine beobachteten zukünftigen Handlungen.',
          'Fehlende Ereignisse in einem dünnen Prüffenster bedeuten nicht, dass kein Risiko besteht.'
        ]}
      />
    </PageTemplate>
  );
}
