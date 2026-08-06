import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const priorities = [
  'Echtzeit-Marktdaten: Brent / Jet-Proxy / Carbon-Proxy',
  'Einheitliche Szenarioberechnung: Preis, Förderung, CO2-Preis, Break-even',
  'Admin-Steuerung: Routenannahmen, Policy-Parameter, Datenquellen',
  'Export und Reporting: Diagramme, Snapshots, Szenariovergleich'
];

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dashboard (DE)',
  description:
    'Deutsches JetScope-Dashboard mit Live-Marktsnapshot, Szenarioregister und Risikosignal für SAF-gegen-Kerosin-Entscheidungen.',
  path: '/de/dashboard'
});

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatAsOf(value: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('de-DE');
}

function sourceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ok: 'OK',
    degraded: 'eingeschränkt',
    offline: 'offline',
    unknown: 'unbekannt'
  };
  return labels[status] ?? status;
}

function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function freshnessLabel(level: string) {
  const labels: Record<string, string> = {
    fresh: 'aktuell',
    stale: 'veraltet',
    critical: 'kritisch'
  };
  return labels[level] ?? level;
}

function riskLevelLabel(level: string) {
  const labels: Record<string, string> = {
    normal: 'normal',
    watch: 'Beobachtung',
    alert: 'Alarm'
  };
  return labels[level] ?? level;
}

export default async function GermanDashboardPage() {
  const readModel = await getDashboardReadModel('de');
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;
  const sourceStatus = readModel.market.source_status;

  const riskColor =
    risk == null ? 'text-warning' : risk.level === 'alert' ? 'text-danger' : risk.level === 'watch' ? 'text-warning' : 'text-success';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/de/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? 'Noch kein belastbares History-Signal; unbekannte Evidenz ist kein normales Risiko.'
      : `Stufe: ${riskLevelLabel(risk.level)} | Stand: ${formatAsOf(risk.latestAsOf)} | Stichproben: ${risk.sampleCount}`;
  const scenarioNeedsReview =
    readModel.isFallback || sourceStatus.overall !== 'ok' || risk == null || risk.level !== 'normal';
  const decisionPosture = risk?.level === 'alert' ? 'Neu rechnen' : scenarioNeedsReview ? 'Zuerst prüfen' : 'Weiter nutzen';
  const decisionTone =
    risk?.level === 'alert' || sourceStatus.overall === 'offline'
      ? 'text-danger'
      : scenarioNeedsReview
        ? 'text-warning'
        : 'text-success';
  const decisionHint = readModel.isFallback
    ? 'Der API-Fallback liefert keine Messung; vor einem Szenario-Neulauf zuerst die Quelle prüfen.'
    : risk?.level === 'alert'
      ? 'Das Historienfenster meldet Alarm; Quellen prüfen und das Szenario mit aktuellen Marktdaten neu rechnen.'
      : risk == null
        ? 'Das Historienfenster hat noch kein erkennbares Signal gebildet; Unbekanntes nicht als normal behandeln.'
        : sourceStatus.overall !== 'ok'
          ? 'Der Quellenstatus ist nicht normal; erst Evidenz prüfen, dann das Szenario weiterverwenden.'
          : risk.level === 'watch'
            ? 'Das Risiko liegt im Beobachtungsbereich; Schlüsselannahmen vor einem Neulauf prüfen.'
            : 'Quellenstatus und Risikofenster lösen derzeit keine erneute Prüfung aus.';
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Marktintelligenz"
      title="JetScope Entscheidungscockpit"
      question="Hat sich die heutige Markt- und Datenlage so verändert, dass Szenarien neu gerechnet werden müssen?"
      asOf={asOf}
    >
      <SignalRow label="Entscheidungssignale">
        <MetricCard
          label="Szenarioaktion"
          value={decisionPosture}
          hint={decisionHint}
          valueClassName={decisionTone}
        />
        <MetricCard
          label="Markt-Snapshot"
          value={`${formatNumber(market.brent_usd_per_bbl)} USD/bbl`}
          hint={`Jet (global) ${formatNumber(market.jet_usd_per_l, 3)} USD/L | Jet (EU-Proxy) ${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)} USD/L | Carbon ${formatNumber(market.carbon_proxy_usd_per_t)} USD/tCO2`}
        />
        <MetricCard
          label="Datenmodus"
          value={readModel.isFallback ? 'Fallback' : 'Live'}
          hint={
            readModel.isFallback
              ? `API-Fallback: ${readModel.error ?? 'unbekannte Ursache'}`
              : `Quellenstatus: ${sourceStatusLabel(sourceStatus.overall)} | Aktualität: ${freshnessLabel(freshness.level)} (${freshness.minutes} Min.)`
          }
          valueClassName={readModel.isFallback ? 'text-danger' : sourceStatusTone(sourceStatus.overall)}
        />
        <MetricCard
          label="Top-Risikosignal"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
          valueHref={riskHref}
        />
      </SignalRow>

      <Panel title="Arbeitszugänge" why="Diese Einstiege verbinden den aktuellen Marktstatus mit den prüfbaren Admin- und Preisansichten.">
        <div className="grid gap-6 md:grid-cols-2">
          <MetricCard label="Admin-Kontrolle" value="Erforderlich" hint="Routenkosten, Policy-Parameter, Quellenpflege" cardHref="/de/admin" />
          <MetricCard
            label="Deutschland Kerosinseite"
            value="Seite öffnen"
            hint="Serverseitige Preisansicht für Brent / Jet global / EU-Jet-Proxy / Carbon mit 1d/7d/30d"
            cardHref="/de/prices/germany-jet-fuel"
          />
        </div>
      </Panel>

      <Panel title="Dashboard-Verantwortung" why="Diese Fähigkeitensammlung zeigt, welche Arbeitsbereiche das Cockpit abdeckt; sie ist selbst keine Marktentscheidung.">
        <ul className="space-y-3 text-sm leading-7 text-muted">
          {priorities.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Migrationsregel" why="Diese Leitplanken erklären, wie ein sicherer Fallback und die nächste Ausbaustufe des Arbeitsmodells behandelt werden.">
        <div className="space-y-3 text-sm leading-7 text-muted">
          <p>1. Erst vertikale End-to-End Slice für market + scenarios, dann Funktionsumfang erweitern.</p>
          <p>2. Bei API-Ausfall bleibt eine sichere Fallback-Darstellung aktiv.</p>
          <p>3. Als Nächstes Vergleichs- und Sweep-Ansichten auf dasselbe Workspace-Modell konsolidieren.</p>
        </div>
      </Panel>

      <Panel title="Aktuelle Szenarien" why="Gespeicherte Szenarien sind lokale Annahmen zum Vergleich und ersetzen keine fachliche oder beschaffungsseitige Freigabe.">
        {readModel.recentScenarioNames.length ? (
          <ul className="space-y-2 text-sm leading-7 text-muted">
            {readModel.recentScenarioNames.map((name) => (
              <li key={name}>• {name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-7 text-muted">
            Noch keine gespeicherten Szenarien. Lege ein Szenario über die API an, um CRUD Ende-zu-Ende zu prüfen.
          </p>
        )}
      </Panel>

      <Panel
        locale="de"
        title="Politik-Zeitlinie"
        why="Wann welche Regel greift, gemessen am Marktzeitpunkt oben - eine Frist, die schon vorbei ist, liest sich sonst wie eine künftige."
      >
        <PolicyTimelineWithMarketTime locale="de" />
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'dashboard-read-model',
            label: readModel.isFallback
              ? 'Markt-Snapshot-API nicht erreichbar; es werden interne Ersatzwerte verwendet'
              : 'Markt-Snapshot-API (Marktwerte, Quellenstatus und Aktualität)',
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
          'Bei gesunder Abdeckung werden Echtzeitwerte bevorzugt aus primären oder offiziellen Quellen übernommen.',
          'Proxy-Werte und Fallback-Werte werden getrennt gekennzeichnet.',
          'Konfidenz, Verzögerung und Degradierungsgrund sind auf der Quellen-Seite prüfbar.',
          'Fallback-Werte halten das Cockpit verfügbar, werden aber nicht als Messung ausgegeben.',
          'Das Risikosignal hängt von der Stichprobengröße im Historienfenster ab; kein Signal bedeutet nicht kein Risiko.',
          'Gespeicherte Szenarien sind lokale Annahmen für Prüfung und Diskussion.'
        ]}
      />
    </PageTemplate>
  );
}
