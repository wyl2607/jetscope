import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Szenario-Workbench',
  description:
    'Deutsche JetScope-Ansicht für gespeicherte SAF-Übergangsannahmen, Marktkontext, Risikosignale und geschützte Schreibgrenzen.',
  path: '/de/scenarios',
  alternateLanguages: {
    'zh-CN': '/scenarios',
    de: '/de/scenarios',
    en: '/en/scenarios'
  }
});

const actionLinks: Array<{ label: string; href: Route; description: string }> = [
  {
    label: 'Primären Szenario-Editor öffnen',
    href: '/scenarios' as Route,
    description:
      'Szenarien in der primären Arbeitsfläche erstellen, aktualisieren oder löschen; Schreibvorgänge bleiben dort durch den Admin-Token geschützt.'
  },
  {
    label: 'Quellennachweise prüfen',
    href: '/de/sources?filter=review' as Route,
    description:
      'Fallback-, Proxy-, eingeschränkte und volatile Zeilen prüfen, bevor gespeicherte Annahmen für Entscheidungen genutzt werden.'
  },
  {
    label: 'Entscheidungscockpit öffnen',
    href: '/de/dashboard' as Route,
    description: 'Zum Live-Marktsnapshot, zur Quellenlage und zum wichtigsten Risikosignal zurückkehren.'
  },
  {
    label: 'Startbereitschaft prüfen',
    href: '/de/admin' as Route,
    description: 'Bestätigen, ob geschützte Schreibvorgänge, Quellenabdeckung und Forschungsgrundlagen einsatzbereit sind.'
  }
];

function formatNumber(value: number, digits = 2): string {
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function riskLevelLabel(level: string): string {
  if (level === 'normal') return 'normal';
  if (level === 'watch') return 'Beobachtung';
  if (level === 'alert') return 'Alarm';
  return level;
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'gesund';
  if (status === 'degraded') return 'eingeschränkt';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unbekannt';
  return status;
}

function formatAsOf(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('de-DE');
}

function deliveryHint(readModel: DashboardReadModel): string {
  if (readModel.isFallback) {
    return 'Lokaler API-Fallback ist aktiv; Annahmen vor Nutzung mit Quellenprüfung und Startbereitschaft abgleichen.';
  }

  return `Quellenstatus: ${sourceStatusLabel(readModel.market.source_status.overall)} | Aktualität ${readModel.freshnessSignal.minutes} Min.`;
}

function safeScenarioName(name: string, index: number): string {
  if (/[\u4e00-\u9fff]/.test(name)) return `Gespeichertes Szenario ${index + 1}`;
  return name;
}

export default async function GermanScenariosPage() {
  const readModel = await getDashboardReadModel('de');
  const market = readModel.market.values;
  const sourceStatus = readModel.market.source_status;
  const risk = readModel.topRiskSignal;
  const needsReview =
    readModel.isFallback ||
    sourceStatus.overall !== 'ok' ||
    risk == null ||
    risk.level !== 'normal' ||
    readModel.scenarioCount === 0;
  const assumptionPosture = readModel.isFallback
    ? 'Nicht belastbar'
    : sourceStatus.overall === 'offline' || risk?.level === 'alert'
      ? 'Neu bewerten'
      : needsReview
        ? 'Prüfen'
        : 'Vertretbar';
  const assumptionTone = readModel.isFallback || sourceStatus.overall === 'offline' || risk?.level === 'alert'
    ? 'text-danger'
    : needsReview
      ? 'text-warning'
      : 'text-success';
  const riskValue =
    risk == null
      ? 'Keine Anomalie'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHint =
    risk == null
      ? 'Das Marktfenster hat noch kein priorisiertes Warnsignal erzeugt.'
      : `${riskLevelLabel(risk.level)} | Stichproben ${risk.sampleCount} | Stand ${formatAsOf(risk.latestAsOf)}`;
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Szenarioprüfung"
      title="Szenario-Workbench"
      question="Repräsentieren die gespeicherten Annahmen noch den aktuellen Markt?"
      asOf={asOf}
    >
      <SignalRow label="Szenarioentscheidung">
        <MetricCard
          label="Annahmenstatus"
          value={assumptionPosture}
          valueClassName={assumptionTone}
          hint={
            readModel.isFallback
              ? 'Der Markt-Read-Model-Fallback macht die gespeicherten Annahmen nicht automatisch belastbar.'
              : needsReview
                ? 'Quellenlage, Risiko oder fehlende Szenarien verlangen eine Prüfung vor der Übernahme.'
                : 'Aktuelle Quellenlage und Risikofenster geben keinen unmittelbaren Prüfhinweis.'
          }
        />
        <MetricCard
          label="Gespeicherte Szenarien"
          value={`${readModel.scenarioCount}`}
          hint={
            readModel.scenarioCount > 0
              ? 'Workspace-Annahmen stehen für Vergleich und Review bereit.'
              : 'Noch kein gespeichertes Szenario; neues Szenario in der primären Arbeitsfläche anlegen.'
          }
        />
        <MetricCard
          label="Marktkontext"
          value={`${formatNumber(market.brent_usd_per_bbl)} USD/bbl`}
          hint={`Jet ${formatNumber(market.jet_usd_per_l, 3)} USD/L | EU-Jet-Proxy ${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)} USD/L | Carbon ${formatNumber(market.carbon_proxy_usd_per_t)} USD/tCO2`}
        />
        <MetricCard
          label="Höchstes Risikosignal"
          value={riskValue}
          hint={riskHint}
          valueClassName={risk?.level === 'alert' ? 'text-danger' : risk?.level === 'watch' ? 'text-warning' : risk == null ? 'text-warning' : 'text-success'}
        />
      </SignalRow>

      <Panel locale="de" title="Szenarioannahmen" why="Gespeicherte Workspace-Datensätze zeigen, welche Annahmen für Vergleich und Review verfügbar sind.">
        {readModel.recentScenarioNames.length ? (
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {readModel.recentScenarioNames.map((name, index) => (
              <li key={`${name}-${index}`}>{safeScenarioName(name, index)}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-warning bg-warning-soft p-4 text-sm leading-7 text-warning">
            Noch keine gespeicherten Annahmen verfügbar. Nutze den primären Szenario-Editor, um überprüfbare Fälle für Preis-, Reserve-, Routen- und Policy-Diskussionen anzulegen.
          </p>
        )}
      </Panel>

      <Panel locale="de" title="Entscheidungskontext" why="Szenarien werden erst mit aktueller Evidenz entscheidungsrelevant; Fallbacks und fehlende Signale müssen sichtbar bleiben.">
        <div className="space-y-3 text-sm leading-7 text-muted">
          <p>{deliveryHint(readModel)}</p>
          <p>Szenarien sind Evidenzdatensätze für Review und Teamdiskussion; sie ersetzen keine Beschaffungsfreigabe, Quellenvalidierung oder geschützte Admin-Konfiguration.</p>
          <p>Vor dem Vergleich von Annahmen prüfen, ob Quellenabdeckung und Startbereitschaft Fallbacks oder deaktivierte Systemteile sichtbar machen.</p>
        </div>
      </Panel>

      <Panel
        locale="de"
        title="Review-Ablauf"
        why="Die nächsten Schritte führen von gespeicherten Annahmen zurück zu Evidenz, Startbereitschaft und geschützten Schreibgrenzen."
      >
        <p className="mb-4 text-sm leading-7 text-muted"><span className="font-medium text-ink">Geschützte Schreibgrenze:</span> Erstellen, Aktualisieren und Löschen bleiben in der primären Szenario-Arbeitsfläche.</p>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {actionLinks.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-semibold text-ink">{action.label}</p>
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
              : 'Markt-Snapshot-API (Quellenstatus, Konfidenz, Fallback-Rate und Aktualität)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
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
          'Gespeicherte Szenarien sind lokale Annahmen für Prüfung und Diskussion; sie ersetzen keine Beschaffungsfreigabe.',
          'Ein Fallback-Read-Model erhält die Seite sichtbar, liefert aber keinen gültigen Datenstand für die enthaltenen Ersatzwerte.',
          'Kein Risikosignal bei dünner Stichprobe heißt nicht, dass kein Risiko besteht.',
          'Die geschützte Schreibgrenze liegt in der primären Szenario-Arbeitsfläche.'
        ]}
      />
    </PageTemplate>
  );
}
