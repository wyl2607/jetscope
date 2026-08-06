import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getLaunchReadinessReadModel, type LaunchReadinessCheck } from '@/lib/readiness-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Startbereitschaft',
  description:
    'Deutsche JetScope-Ansicht für Startvoraussetzungen, geschützte Operationen und Wiederherstellungspfade für Quellen, Token und Forschungssignale.',
  path: '/de/admin',
  alternateLanguages: {
    'zh-CN': '/admin',
    de: '/de/admin',
    en: '/en/admin'
  }
});

const protectedOperations = [
  'Geschützte Schreibvorgänge, Aktualisierungen und Parameteränderungen bleiben in der primären Admin-Konsole.',
  'Diese deutsche Ansicht ist nur lesend und zeigt keine geheimen Werte an.',
  'Die Prüfungen zeigen, ob Quellen-, Forschungs-, Token- oder Datenbankarbeit vor dem Start noch offen ist.'
];

const checkLabels: Record<string, string> = {
  database: 'Datenbank',
  market_snapshot: 'Markt-Snapshot',
  source_coverage: 'Quellenabdeckung',
  admin_token: 'Admin-Token',
  ai_research_pipeline: 'AI-Research-Pipeline'
};

function readinessStatusLabel(status: string): string {
  if (status === 'ready') return 'Startkandidat';
  if (status === 'degraded') return 'Lauffähig, Prüfung nötig';
  if (status === 'not_ready') return 'Nicht bereit';
  return `Nicht erkannter Status: ${status}`;
}

function checkStatusLabel(status: string): string {
  if (status === 'ok') return 'Gesund';
  if (status === 'degraded') return 'Eingeschränkt';
  if (status === 'missing') return 'Konfiguration fehlt';
  if (status === 'disabled') return 'Deaktiviert';
  if (status === 'missing_credentials') return 'Zugangsdaten fehlen';
  if (status === 'mock') return 'Mock-Modus';
  if (status === 'seed') return 'Seed-Daten';
  if (status === 'error') return 'Fehler';
  return `Nicht erkannt: ${status}`;
}

function readinessToneClass(check: LaunchReadinessCheck): string {
  if (check.tone === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (check.tone === 'review') return 'border-warning bg-warning-soft text-warning';
  if (check.tone === 'ok' && check.status === 'ok') return 'border-success bg-success-soft text-success';
  if (check.tone === 'ok') return 'border-warning bg-warning-soft text-warning';
  return 'border-warning bg-warning-soft text-warning';
}

function launchImpactLabel(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'Blockiert Start';
  if (check.severity === 'review') return 'Prüfung nötig';
  if (check.severity === 'ok') return 'Startbereit';
  return 'Nicht erkannter Status';
}

function launchImpactClass(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'border-danger bg-danger-soft text-danger';
  if (check.severity === 'ok') return 'border-success bg-success-soft text-success';
  return 'border-warning bg-warning-soft text-warning';
}

function readinessValueTone(readiness: Awaited<ReturnType<typeof getLaunchReadinessReadModel>>): string {
  if (readiness.error || !readiness.ready) return 'text-danger';
  if (readiness.status === 'ready' && !readiness.degraded) return 'text-success';
  return 'text-warning';
}

function actionFor(check: LaunchReadinessCheck): { label: string; href: Route } {
  if (check.key === 'source_coverage') {
    return {
      label: check.ok ? 'Quellen öffnen' : 'Quellen beheben',
      href: '/de/sources?filter=review' as Route
    };
  }
  if (check.key === 'market_snapshot') {
    return { label: 'Marktquellen öffnen', href: '/de/sources' as Route };
  }
  if (check.key === 'admin_token') {
    return { label: 'Primäre Admin-Konsole öffnen', href: '/admin' as Route };
  }
  if (check.key === 'ai_research_pipeline') {
    return { label: 'Forschungspfad prüfen', href: '/admin' as Route };
  }
  return { label: 'Zur Übersicht', href: '/de/dashboard' as Route };
}

function safeDetail(check: LaunchReadinessCheck): string {
  const detail = check.detail || '';
  if (/[\u4e00-\u9fff]/.test(detail)) {
    return 'Diese Voraussetzung in der primären Admin-Konsole prüfen.';
  }
  if (!detail) {
    return 'Die API meldet keine weiteren Details für diese Prüfung.';
  }
  if (check.key === 'database') {
    return 'Datenbankprüfung ohne zusätzliche Hinweise.';
  }
  if (check.key === 'market_snapshot') {
    const count = detail.match(/(\d+)\s+metrics available/);
    return count ? `${count[1]} Marktmesswerte verfügbar.` : 'Markt-Snapshot prüfen und bei Bedarf aktualisieren.';
  }
  if (check.key === 'source_coverage') {
    return detail
      .replace('completeness=', 'Vollständigkeit ')
      .replace('metrics=', 'Messwerte ');
  }
  if (check.key === 'admin_token') {
    return 'JETSCOPE_ADMIN_TOKEN ist nicht konfiguriert; geschützte Schreibvorgänge und Marktaktualisierung bleiben gesperrt.';
  }
  if (check.key === 'ai_research_pipeline') {
    return 'JETSCOPE_AI_RESEARCH_ENABLED ist false; Erzeugung von Forschungssignalen ist deaktiviert.';
  }
  return detail;
}

export default async function GermanAdminPage() {
  const readiness = await getLaunchReadinessReadModel();
  const asOf = readiness.error ? null : readiness.generatedAt;
  const blockingCount = readiness.checks.filter((check) => check.blocking).length;
  const reviewCount = readiness.checks.filter((check) => check.severity === 'review').length;

  return (
    <PageTemplate
      locale="de"
      eyebrow="Startbetrieb"
      title="Startbereitschaft"
      question="Kann dieses Backend jetzt sicher schreiben und in Betrieb gehen?"
      asOf={asOf}
    >
      <SignalRow label="Signale zur Startentscheidung">
        <MetricCard
          label="Startentscheidung"
          value={readinessStatusLabel(readiness.status)}
          valueClassName={readinessValueTone(readiness)}
          hint={readiness.error ? `Readiness-API nicht verfügbar: ${readiness.error}` : readiness.ready ? 'Keine Voraussetzung blockiert den Start.' : 'Blocker vor Schreibvorgängen oder Start beheben.'}
        />
        <MetricCard
          label="Blocker"
          value={`${blockingCount}`}
          valueClassName={blockingCount > 0 ? 'text-danger' : 'text-success'}
          hint="Jeder Blocker verhindert einen sicheren Start."
        />
        <MetricCard
          label="Prüfpunkte"
          value={`${reviewCount}`}
          valueClassName={reviewCount > 0 ? 'text-warning' : 'text-success'}
          hint="Nicht zwingend blockierend, aber vor dem Start zu bestätigen."
        />
        <MetricCard
          label="Umgebungskontext"
          value={`${readiness.environment} · ${readiness.apiPrefix}`}
          hint={`Schema ${readiness.schemaBootstrapMode}; die Aussage gilt nur für diese Umgebung.`}
        />
      </SignalRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel locale="de" title="Geschützte Operationen" why="Diese Grenzen zeigen, welche Aktionen hier nur geprüft und welche ausschließlich in der primären Konsole ausgeführt werden.">
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {protectedOperations.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </Panel>

        <Panel locale="de" title="Backend-Vertrag" why="Der Readiness-Vertrag legt fest, welche Voraussetzungen geprüft werden, ohne geheime Werte offenzulegen.">
          <div className="space-y-3 text-sm leading-7 text-muted">
            <p>Datenbank-Bootstrap, Markt-Snapshot, Quellenabdeckung, Admin-Token-Konfiguration und Forschungssignal-Status kommen aus dem API-Readiness-Vertrag.</p>
            <p>Geheime Werte werden von Readiness nicht zurückgegeben und von dieser deutschen Seite nicht abgefragt.</p>
            <p>Parameterbearbeitung, manuelle Aktualisierung und Token-Eingabe bleiben in der primären Admin-Konsole.</p>
          </div>
        </Panel>
      </div>

      <Panel locale="de" title="Startbereitschaftsprüfungen" why="Die Einzelprüfungen zeigen, welche Voraussetzung den Start blockiert oder vorab bestätigt werden muss.">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-xl border px-3 py-1.5 font-semibold ${readiness.error || !readiness.ready ? 'border-danger bg-danger-soft text-danger' : readiness.status === 'ready' && !readiness.degraded ? 'border-success bg-success-soft text-success' : 'border-warning bg-warning-soft text-warning'}`}>
            {readiness.ready ? 'Bereit' : 'Nicht bereit'}
          </span>
          {readiness.degraded ? (
            <span className="rounded-xl border border-warning bg-warning-soft px-3 py-1.5 font-semibold text-warning">
              Eingeschränkt
            </span>
          ) : null}
          <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
            {readiness.environment} | {readiness.apiPrefix} | Schema {readiness.schemaBootstrapMode}
          </span>
        </div>
        {readiness.error ? (
          <p className="mt-4 rounded-xl border border-danger bg-danger-soft p-3 text-sm leading-6 text-danger">
            Readiness-API ist nicht verfügbar: {readiness.error}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line border-y border-line">
            {readiness.checks.map((check) => {
              const action = actionFor(check);
              return (
                <div key={check.key} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(9rem,12rem)_minmax(11rem,13rem)_1fr_auto] md:items-start">
                  <p className="font-semibold text-ink">{checkLabels[check.key] ?? check.key}</p>
                  <div className="flex flex-col items-start gap-1.5">
                    <span className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check)}`}>
                      {checkStatusLabel(check.status)}
                    </span>
                    <span className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${launchImpactClass(check)}`}>
                      {launchImpactLabel(check)}
                    </span>
                  </div>
                  <div className="space-y-2 leading-6 text-muted">
                    <p>{safeDetail(check)}</p>
                    {check.configKeys.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-semibold text-muted">Relevante Konfiguration:</span>
                        {check.configKeys.map((configKey) => (
                          <code key={configKey} className="rounded-xl border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[0.72rem] text-muted">
                            {configKey}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href={action.href}
                    className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                  >
                    {action.label}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'launch-readiness-api',
            label: readiness.error ? 'Readiness-API derzeit nicht verfügbar' : 'Serverseitig berechnete Readiness-API-Prüfungen',
            asOf,
            basis: readiness.error ? 'assumption' : 'derived'
          },
          {
            id: 'backend-data-contract',
            label: 'Backend-Datenvertrag: route_catalog / policy_parameters / market_snapshots / scenarios',
            basis: 'assumption'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen und Datenkonventionen öffnen"
        limitations={[
          'Diese Seite zeigt die Bereitschaft der aktuellen Deployment-Umgebung, nicht die Obergrenze der Produktfähigkeiten.',
          'Die Prüfungen werden serverseitig aus Konfiguration und Datenverträgen abgeleitet; geschützte Schreibvorgänge benötigen weiterhin eine gültige Admin-Berechtigung.'
        ]}
      />
    </PageTemplate>
  );
}
