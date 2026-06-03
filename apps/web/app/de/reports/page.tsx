import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
  const readiness = readModel.isFallback || sourceStatus.overall !== 'ok' ? 'Prüfung nötig' : 'Veröffentlichungskandidat';
  const readinessHint = readModel.isFallback
    ? 'Die Berichtswerkstatt kann rendern, aber der lokale API-Fallback ist aktiv; Quellen und Startbereitschaft vor Nutzung prüfen.'
    : sourceStatus.overall !== 'ok'
      ? `Quellenstatus ist ${sourceStatusLabel(sourceStatus.overall)}; vor Start oder Veröffentlichung zuerst Evidenz prüfen.`
      : 'Berichtseinstiege können aus dem aktuellen Read Model geprüft werden.';
  const riskHref = topRiskSignal
    ? (`/de/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}` as Route)
    : undefined;

  return (
    <Shell
      locale="de"
      eyebrow="Berichtsbereitschaft"
      title="Berichtswerkstatt"
      description="Cockpit-Daten, Quellenzustand, gespeicherte Szenarien und Berichtseinstiege in einer deutschen Startprüfungs-Checkliste bündeln."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Quellenstatus"
          value={sourceStatusLabel(sourceStatus.overall)}
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
        <MetricCard
          label="Startposition"
          value={readiness}
          hint={readinessHint}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard title="Berichtskatalog" subtitle="Prüfbar, anklickbar und erweiterbar">
          <div className="space-y-4">
            {reports.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="block rounded-md border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="text-xs font-semibold uppercase text-sky-700">{report.status}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">{report.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-700">{report.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>

        <InfoCard title="Vor dem Start" subtitle="Der nächste Schritt ist Evidenzprüfung">
          <div className="space-y-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-md border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="font-semibold text-slate-950">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>
      </section>
    </Shell>
  );
}
