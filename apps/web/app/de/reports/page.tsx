import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Berichtswerkstatt',
  description:
    'Deutsche JetScope-Berichtswerkstatt für Quellenstatus, gespeicherte Szenarien, Risikosignale und Startprüfung vor Veröffentlichung.',
  path: '/de/reports',
  alternateLanguages: {
    'zh-CN': '/reports',
    de: '/de/reports',
    en: '/en/reports'
  }
});

const reports: Array<{ title: string; description: string; href: Route; status: string }> = [
  {
    title: 'Tipping-Point-Bericht',
    description:
      'Hauptbericht, der Reserve-Druck, Kraftstoffökonomie, Airline-Entscheidungswahrscheinlichkeit und Forschungssignale zusammenführt.',
    href: '/de/reports/tipping-point-analysis' as Route,
    status: 'Mit aktuellem Read Model verbunden'
  }
];

const actions: Array<{ label: string; href: Route; description: string }> = [
  {
    label: 'Quellennachweise prüfen',
    href: '/de/sources?filter=review' as Route,
    description:
      'Fallback-, Proxy-, eingeschränkte und volatile Zeilen prüfen, bevor Berichtsergebnisse als Entscheidungsgrundlage genutzt werden.'
  },
  {
    label: 'Entscheidungscockpit öffnen',
    href: '/de/dashboard' as Route,
    description: 'Zum aktuellen Marktsnapshot, zur Quellenlage, zu Szenarien und zum wichtigsten Risikosignal zurückkehren.'
  },
  {
    label: 'Startbereitschaft prüfen',
    href: '/de/admin' as Route,
    description: 'Quellenabdeckung, Admin-Token und Forschungsgrundlagen vor Start oder Veröffentlichung bestätigen.'
  }
];

function formatPercent(value?: number | null): string {
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

// Abschnitt 1 Regel 5: Der Farbton ist eine Aussage über die Daten. Eine Seite,
// die "Prüfung nötig" in derselben Farbe wie alles andere zeigt, hat das Problem
// genannt, aber nicht sichtbar gemacht.
function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function freshnessLabel(level: string): string {
  if (level === 'fresh') return 'aktuell';
  if (level === 'stale') return 'veraltet';
  if (level === 'critical') return 'kritisch';
  return level;
}

function riskLabel(level: string): string {
  if (level === 'normal') return 'normal';
  if (level === 'watch') return 'Beobachtung';
  if (level === 'alert') return 'Alarm';
  return level;
}

function safeScenarioSummary(names: string[]): string {
  if (!names.length) return 'Noch kein gespeichertes Szenario.';

  return names
    .map((name, index) => (/[\u4e00-\u9fff]/.test(name) ? `Gespeichertes Szenario ${index + 1}` : name))
    .join(' / ');
}

export default async function GermanReportsPage() {
  const readModel = await getDashboardReadModel('de');
  const sourceStatus = readModel.market.source_status;
  const topRiskSignal = readModel.topRiskSignal;
  const latestScenarioNames = safeScenarioSummary(readModel.recentScenarioNames);
  const needsReview = readModel.isFallback || sourceStatus.overall !== 'ok';
  const readiness = needsReview ? 'Prüfung nötig' : 'Veröffentlichungskandidat';
  const readinessHint = readModel.isFallback
    ? 'Die Berichtswerkstatt kann rendern, aber der lokale API-Fallback ist aktiv; Quellen und Startbereitschaft vor Nutzung prüfen.'
    : sourceStatus.overall !== 'ok'
      ? `Quellenstatus ist ${sourceStatusLabel(sourceStatus.overall)}; vor Start oder Veröffentlichung zuerst Evidenz prüfen.`
      : 'Berichtseinstiege können aus dem aktuellen Read Model geprüft werden.';
  const riskHref = topRiskSignal
    ? (`/de/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}` as Route)
    : undefined;

  // Das Fallback-Read-Model stempelt sich mit der aktuellen Zeit. Diese als
  // Datenstand zu zeigen würde erfundene Werte als frisch ausgeben - deshalb
  // hier kein Stempel; die Fußzeile nennt den Grund.
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Berichtsbereitschaft"
      title="Berichtswerkstatt"
      question="Ist dieser Bericht belastbar genug, um jetzt als Entscheidungsgrundlage veröffentlicht zu werden?"
      asOf={asOf}
    >
      <SignalRow label="Startbereitschaftssignale">
        {/* Abschnitt 2 Regel 2: Das Urteil steht vorn. Wer nach der ersten
            Karte aufhört, hat die Antwort auf die Frage oben trotzdem. */}
        <MetricCard
          label="Startposition"
          value={readiness}
          valueClassName={needsReview ? 'text-warning' : 'text-success'}
          hint={readinessHint}
        />
        <MetricCard
          label="Quellenstatus"
          value={sourceStatusLabel(sourceStatus.overall)}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={`Konfidenz ${formatPercent((sourceStatus.confidence ?? 0) * 100)} | Fallback-Rate ${formatPercent(sourceStatus.fallback_rate)} | ${freshnessLabel(readModel.freshnessSignal.level)} ${readModel.freshnessSignal.minutes} Min.`}
        />
        <MetricCard
          label="Szenarioanzahl"
          value={`${readModel.scenarioCount}`}
          hint={latestScenarioNames}
        />
        <MetricCard
          label="Risikosignal"
          value={topRiskSignal ? `${topRiskSignal.metric} ${topRiskSignal.window}` : 'Keine Anomalie'}
          hint={
            topRiskSignal
              ? `${riskLabel(topRiskSignal.level)} | ${topRiskSignal.changePct > 0 ? '+' : ''}${topRiskSignal.changePct.toFixed(2)}%`
              : 'Das Marktfenster hat noch kein priorisiertes Warnsignal erzeugt.'
          }
          valueHref={riskHref}
        />
      </SignalRow>

      <Panel
        locale="de"
        title="Berichtskatalog"
        why="Jeder Berichtseinstieg und ob er an Live-Daten oder an eine statische Darstellung angebunden ist."
      >
          <div className="space-y-4">
            {reports.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{report.status}</p>
                <h3 className="mt-2 text-lg font-medium text-ink">{report.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
              </Link>
            ))}
          </div>
      </Panel>

      <Panel
        locale="de"
        title="Vor dem Start"
        why="Der nächste Schritt ist Evidenzprüfung, nicht Vermutung - jeder Einstieg führt zu etwas Nachprüfbarem."
      >
          <div className="space-y-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="font-medium text-ink">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
              </Link>
            ))}
          </div>
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'dashboard-read-model',
            label: readModel.isFallback
              ? 'Markt-Snapshot-API nicht erreichbar; es werden interne Ersatzwerte verwendet'
              : 'Markt-Snapshot-API (Quellenstatus, Konfidenz, Fallback-Rate, Aktualität)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
            // Ein Szenario ist eine Annahme. Dass es gespeichert ist, ist gemessen -
            // aber gelesen werden die Zahlen darin, also traegt die Quelle 'assumption'.
            label: `Lokaler Szenariospeicher (${readModel.scenarioCount} gespeicherte Szenarien)`,
            basis: 'assumption'
          },
          {
            id: 'risk-signal',
            label: 'Das Risikosignal wird aus der Bewegung im Markthistorienfenster abgeleitet, nicht vom Upstream geliefert',
            basis: 'derived'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          '„Veröffentlichungskandidat“ heißt, dass der Datenpfad prüfbar ist - nicht, dass die Aussage fachlich geprüft wurde.',
          'Das Risikosignal hängt von der Stichprobengröße im Historienfenster ab. Kein Alarm bei dünner Stichprobe heißt nicht kein Risiko.',
          'Gespeicherte Szenarien sind lokale Annahmen für Prüfung und Diskussion; sie ersetzen keine Beschaffungsfreigabe.'
        ]}
      />
    </PageTemplate>
  );
}
