import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getCrisisBriefReadModel, type CrisisBriefReadModel } from '@/lib/crisis-brief-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Krisenbrief',
  description:
    'Deutscher JetScope-Krisenmonitor für EU-Kerosin-Reservestress, Quellenvertrauen, Kippereignisse und Forschungsstatus.',
  path: '/de/crisis',
  alternateLanguages: {
    'zh-CN': '/crisis',
    de: '/de/crisis',
    en: '/en/crisis'
  }
});

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

function formatAsOf(value?: string | null): string {
  if (!value) return 'nicht verfügbar';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('de-DE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'gesund';
  if (status === 'degraded') return 'eingeschränkt';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unbekannt';
  return status;
}

function reserveStressLabel(level: string | undefined): string {
  if (level === 'critical') return 'kritisch';
  if (level === 'elevated') return 'erhöht';
  if (level === 'normal') return 'normal';
  return 'Prüfung';
}

// Abschnitt 1 Regel 5: Der Farbton benennt einen Sachverhalt. Ein unbekannter
// Reservestand ist kein normaler Reservestand - beides grau zu zeigen würde die
// Lücke verstecken, statt sie zu melden.
function reserveStressTone(level: string | undefined): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

// Abschnitt 3: gemessen, abgeleitet und angenommen sind nicht dasselbe, und
// eine manuelle Schätzung darf nicht wie eine amtliche Meldung aussehen.
function reserveBasis(sourceType: string | undefined): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

function researchPosture(status: string, count: number): string {
  if (status === 'disabled') return 'deaktivierte Grenze';
  if (status === 'empty') return 'wartet auf Signale';
  return count > 0 ? 'mit Signalen belegt' : 'wartet auf Signale';
}

function actionHref(readModel: CrisisBriefReadModel, id: string, fallback: Route): Route {
  return (readModel.actions.find((action) => action.id === id)?.href ?? fallback) as Route;
}

export default async function GermanCrisisPage() {
  const readModel = await getCrisisBriefReadModel('de');

  const sourceStatus = readModel.sourceStatus;
  const latestEvent = readModel.tippingEvents[0] ?? null;
  const reserveWeeks = readModel.reserve?.coverage_weeks ?? null;
  const reserveConfidence = readModel.reserve?.confidence_score ?? null;
  const reserveSourceName = readModel.reserve?.source_name ?? 'Fallback-Szenariobasis';
  const fossilPrice = readModel.fossilJetUsdPerL;
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(readModel.research.status, readModel.research.signal_count);
  const reviewSourcesRoute = actionHref(readModel, 'review_sources', '/de/sources?filter=review' as Route);
  const reportRoute = actionHref(readModel, 'open_report', '/de/reports/tipping-point-analysis' as Route);
  const scenariosRoute = actionHref(readModel, 'review_scenarios', '/de/scenarios' as Route);

  // Auf Fallback stempelt sich das Read Model mit der aktuellen Zeit. Diese als
  // Datenstand zu zeigen würde erfundene Werte als frisch ausgeben.
  const asOf = readModel.error ? null : (readModel.reserve?.generated_at ?? readModel.marketGeneratedAt);

  return (
    <PageTemplate
      locale="de"
      eyebrow="Krisenmonitor"
      title="Krisenbrief"
      question="Ist der Reservestress hoch genug, um jetzt eine operative Entscheidung zu ändern?"
      asOf={asOf}
    >
      <SignalRow label="Krisensignale">
        {/* Abschnitt 2 Regel 2: Der Reservestand ist die Antwort, alles
            Weitere erklärt, wie sehr man ihm trauen darf. */}
        <MetricCard
          label="Reservestress"
          value={reserveWeeks == null ? 'n/a' : `${formatNumber(reserveWeeks, 1)} Wochen`}
          valueClassName={reserveStressTone(readModel.reserve?.stress_level)}
          hint={`EU-Reservehaltung: ${reserveStressLabel(readModel.reserve?.stress_level)} | ${reserveSourceName}`}
        />
        <MetricCard
          label="Quellenvertrauen"
          value={sourceConfidence}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={`Marktstatus ${sourceStatusLabel(sourceStatus.overall)} | Reservevertrauen ${formatPercent((reserveConfidence ?? 0) * 100)}`}
          cardHref={reviewSourcesRoute}
        />
        <MetricCard
          label="Kippereignisse"
          value={`${readModel.tippingEvents.length}`}
          hint={latestEvent ? `${latestEvent.event_type.toLowerCase()} | ${latestEvent.saf_pathway.toUpperCase()} | ${formatAsOf(latestEvent.observed_at)}` : 'Keine Ereignisse im aktuellen Prüffenster.'}
        />
        <MetricCard
          label="Forschungsstatus"
          value={researchStatus}
          hint={readModel.research.signal_count ? `${readModel.research.signal_count} Forschungssignale verfügbar.` : 'Die Seite zeigt die Forschungsgrenze, statt Evidenz zu erfinden.'}
        />
      </SignalRow>

      <Panel
        locale="de"
        title="Operative Lage"
        why="Was die Zahlen oben zusammen bedeuten, und woran man erkennt, ob sie aus Live-Evidenz oder aus einer Fallback-Lage stammen."
      >
        <div className="space-y-4 text-sm leading-7 text-muted">
            <p>
              Der aktuelle fossile Kostenanker liegt bei <strong>{formatPrice(fossilPrice)}</strong>. JetScope stellt
              diesen Wert neben EU-Reserveabdeckung und Quellenvertrauen, damit Prüfer Live-Evidenz von Fallback-Lagen
              trennen können, bevor Beschaffung oder SAF-Annahmen geändert werden.
            </p>
            <p>
              Der Krisenbrief kommt aus dem FastAPI-Crisis-Brief-Vertrag. Die Seite zeigt dadurch eine kohärente
              operative Lage, ohne Reserve-, Quellen-, Kippereignis- und Forschungsaggregation in der Anzeige zu duplizieren.
            </p>
        </div>
      </Panel>

      <Panel
        locale="de"
        title="Evidenzdisziplin"
        why="Die vier Angaben, an denen sich entscheidet, ob dieser Brief als Entscheidungsgrundlage taugt oder erst durch die Quellenprüfung muss."
      >
        <dl className="space-y-3 text-sm text-muted">
          <div className="flex items-center justify-between gap-4">
            <dt>Marktfrische</dt>
            <dd className="font-medium tabular-nums text-ink">
              {typeof sourceStatus.freshness_minutes === 'number' ? `${sourceStatus.freshness_minutes} Min.` : 'Prüfung'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Fallback-Rate</dt>
            <dd className="font-medium tabular-nums text-ink">{formatPercent(sourceStatus.fallback_rate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Reservezeitpunkt</dt>
            <dd className="font-medium tabular-nums text-ink">{formatAsOf(readModel.reserve?.generated_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Vertragsstatus</dt>
            <dd className={`font-medium ${readModel.error ? 'text-warning' : 'text-success'}`}>
              {readModel.error ? 'Fallback' : 'verbunden'}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        locale="de"
        title="Nächste Schritte"
        why="Ein Krisenbrief, der nur Zahlen zeigt, ändert nichts. Jeder Einstieg führt zu etwas Nachprüfbarem."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
          {
            title: 'Quellennachweise prüfen',
            description: 'Fallback-, Proxy-, eingeschränkte und volatile Zeilen prüfen, bevor das Krisensignal operativ genutzt wird.',
            href: reviewSourcesRoute
          },
          {
            title: 'Lokalen Bericht öffnen',
            description: 'Vom Kurzbrief in den quellengestützten Kipppunktbericht mit längerer Prüferzählung wechseln.',
            href: reportRoute
          },
          {
            title: 'Szenarien prüfen',
            description: 'Gespeicherte Annahmen gegen aktuellen Reservestress und Marktvertrauen halten, bevor sich der Plan ändert.',
            href: scenariosRoute
          }
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-medium text-ink">{action.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'crisis-brief-api',
            label: readModel.error
              ? `Crisis-Brief-API nicht erreichbar; es werden interne Ersatzwerte verwendet (${readModel.error})`
              : 'Crisis-Brief-API (Reserve, Quellenstatus, Kippereignisse, Forschungslage)',
            asOf,
            basis: readModel.error ? 'assumption' : 'observed'
          },
          {
            id: 'reserve-source',
            label: `EU-Reservehaltung über ${reserveSourceName}`,
            asOf: readModel.reserve?.generated_at ?? null,
            basis: reserveBasis(readModel.reserve?.source_type)
          },
          {
            id: 'tipping-events',
            label: `${readModel.tippingEvents.length} beobachtete SAF-Kippereignisse im Prüffenster`,
            basis: 'observed'
          },
          {
            id: 'fossil-anchor',
            label: `Fossiler Kostenanker ${formatPrice(fossilPrice)}, aus dem Marktsnapshot abgeleitet`,
            basis: 'derived'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          'Der Brief zeigt Reservedruck, nicht die Beschaffungslage eines einzelnen Betreibers. Verträge und Vorräte einer Airline stehen hier nicht drin.',
          'Kippereignisse werden im Prüffenster gezählt. Keine Ereignisse heißt nicht kein Risiko, sondern nur: in diesem Fenster wurde keine Überschreitung beobachtet.',
          'Ist die Reservequelle eine manuelle Schätzung, trägt sie oben die Kennzeichnung „Szenarioannahme" und darf nicht wie eine amtliche Meldung gelesen werden.'
        ]}
      />
    </PageTemplate>
  );
}
