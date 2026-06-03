import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
  return status;
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
  return status;
}

function readinessToneClass(tone: LaunchReadinessCheck['tone']): string {
  if (tone === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (tone === 'review') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function launchImpactLabel(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'Blockiert Start';
  if (check.severity === 'review') return 'Prüfung nötig';
  return 'Startbereit';
}

function launchImpactClass(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (check.severity === 'review') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
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

  return (
    <Shell
      locale="de"
      eyebrow="Startbetrieb"
      title="Startbereitschaft"
      description="Eine nur lesende deutsche Ansicht der JetScope-Voraussetzungen vor Veröffentlichung, Startentscheidung oder geschützter Aktualisierung."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <InfoCard title="Geschützte Operationen" subtitle="Erst prüfen, Schreibvorgänge nur in der primären Konsole">
          <ul className="space-y-3 text-sm leading-7 text-slate-700">
            {protectedOperations.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Backend-Vertrag" subtitle="FastAPI-Readiness ohne geheime Werte">
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>Datenbank-Bootstrap, Markt-Snapshot, Quellenabdeckung, Admin-Token-Konfiguration und Forschungssignal-Status kommen aus dem API-Readiness-Vertrag.</p>
            <p>Geheime Werte werden von Readiness nicht zurückgegeben und von dieser deutschen Seite nicht abgefragt.</p>
            <p>Parameterbearbeitung, manuelle Aktualisierung und Token-Eingabe bleiben in der primären Admin-Konsole.</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-5">
        <InfoCard title="Startbereitschaftsprüfungen" subtitle={`API-Status: ${readinessStatusLabel(readiness.status)}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-md border px-3 py-1.5 font-semibold ${readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {readiness.ready ? 'Bereit' : 'Nicht bereit'}
            </span>
            {readiness.degraded ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                Eingeschränkt
              </span>
            ) : null}
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              {readiness.environment} | {readiness.apiPrefix} | Schema {readiness.schemaBootstrapMode}
            </span>
          </div>
          {readiness.error ? (
            <p className="mt-4 border-y border-rose-200 py-3 text-sm leading-6 text-rose-700">
              Readiness-API ist nicht verfügbar: {readiness.error}
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {readiness.checks.map((check) => {
                const action = actionFor(check);
                return (
                  <div key={check.key} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(9rem,12rem)_minmax(11rem,13rem)_1fr_auto] md:items-start">
                    <p className="font-semibold text-slate-950">{checkLabels[check.key] ?? check.key}</p>
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check.tone)}`}>
                        {checkStatusLabel(check.status)}
                      </span>
                      <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${launchImpactClass(check)}`}>
                        {launchImpactLabel(check)}
                      </span>
                    </div>
                    <div className="space-y-2 leading-6 text-slate-700">
                      <p>{safeDetail(check)}</p>
                      {check.configKeys.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">Relevante Konfiguration:</span>
                          {check.configKeys.map((configKey) => (
                            <code key={configKey} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[0.72rem] text-slate-700">
                              {configKey}
                            </code>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Link
                      href={action.href}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                    >
                      {action.label}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </InfoCard>
      </section>
    </Shell>
  );
}
