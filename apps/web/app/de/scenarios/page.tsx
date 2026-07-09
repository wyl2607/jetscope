import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
    return 'Lokaler API-Fallback ist aktiv; Entscheidungen vor Nutzung mit Quellenprüfung und Startbereitschaft abgleichen.';
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
  const risk = readModel.topRiskSignal;
  const riskValue =
    risk == null
      ? 'Keine Anomalie'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHint =
    risk == null
      ? 'Das Marktfenster hat noch kein priorisiertes Warnsignal erzeugt.'
      : `${riskLevelLabel(risk.level)} | Stichproben ${risk.sampleCount} | Stand ${formatAsOf(risk.latestAsOf)}`;

  return (
    <Shell
      locale="de"
      eyebrow="Szenarioprüfung"
      title="Szenario-Workbench"
      description="Gespeicherte SAF-Übergangsannahmen und Entscheidungskontext auf Deutsch prüfen, während geschützte Szenario-Schreibvorgänge in der primären Arbeitsfläche bleiben."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          valueClassName={risk?.level === 'alert' ? 'text-rose-700' : risk?.level === 'watch' ? 'text-amber-700' : 'text-emerald-700'}
        />
        <MetricCard
          label="Geschützte Schreibgrenze"
          value="Primäre Arbeitsfläche"
          hint="Erstellen, Aktualisieren und Löschen benötigen einen Admin-Token in der primären Szenario-Arbeitsfläche."
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <InfoCard title="Szenarioannahmen" subtitle="Gespeicherte Workspace-Datensätze">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-3 text-sm leading-7 text-slate-700">
              {readModel.recentScenarioNames.map((name, index) => (
                <li key={`${name}-${index}`}>{safeScenarioName(name, index)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-700">
              Noch keine gespeicherten Annahmen verfügbar. Nutze den primären Szenario-Editor, um überprüfbare Fälle für Preis-, Reserve-, Routen- und Policy-Diskussionen anzulegen.
            </p>
          )}
        </InfoCard>

        <InfoCard title="Entscheidungskontext" subtitle="Szenarien mit aktueller Evidenz nutzen">
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>{deliveryHint(readModel)}</p>
            <p>Szenarien sind Evidenzdatensätze für Review und Teamdiskussion; sie ersetzen keine Beschaffungsfreigabe, Quellenvalidierung oder geschützte Admin-Konfiguration.</p>
            <p>Vor dem Vergleich von Annahmen prüfen, ob Quellenabdeckung und Startbereitschaft Fallbacks oder deaktivierte Systemteile sichtbar machen.</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="Review-Ablauf" subtitle="Von Annahmen zu Evidenz">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {actionLinks.map((action) => (
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
