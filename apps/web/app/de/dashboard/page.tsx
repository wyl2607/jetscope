import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
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

  const riskColor =
    risk?.level === 'alert' ? 'text-rose-300' : risk?.level === 'watch' ? 'text-amber-300' : 'text-emerald-300';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/de/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? 'Noch kein belastbares History-Signal'
      : `Stufe: ${riskLevelLabel(risk.level)} | Stand: ${formatAsOf(risk.latestAsOf)} | Stichproben: ${risk.sampleCount}`;

  return (
    <Shell
      locale="de"
      eyebrow="Produkt-Dashboard (DE)"
      title="JetScope Entscheidungscockpit"
      description="Deutsche Einstiegsseite für SAF-vs-Kerosin-Entscheidungen auf Basis von FastAPI + PostgreSQL-Snapshot und Szenario-Registry."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Markt-Snapshot"
          value={`${formatNumber(market.brent_usd_per_bbl)} USD/bbl`}
          hint={`Jet (global) ${formatNumber(market.jet_usd_per_l, 3)} USD/L | Jet (EU-Proxy) ${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)} USD/L | Carbon ${formatNumber(market.carbon_proxy_usd_per_t)} USD/tCO2`}
        />
        <MetricCard
          label="Szenario-Modus"
          value={`${readModel.scenarioCount}`}
          hint="Daten aus /v1/workspaces/{slug}/scenarios"
        />
        <MetricCard label="Admin-Kontrolle" value="Erforderlich" hint="Routenkosten, Policy-Parameter, Quellenpflege" />
        <MetricCard
          label="Datenmodus"
          value={readModel.isFallback ? 'Fallback' : 'Live'}
          hint={
            readModel.isFallback
              ? `API-Fallback: ${readModel.error ?? 'unbekannte Ursache'}`
              : `Quellenstatus: ${sourceStatusLabel(readModel.market.source_status.overall)} | Aktualität: ${freshnessLabel(freshness.level)} (${freshness.minutes} Min.)`
          }
        />
        <MetricCard
          label="Top-Risikosignal"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
          valueHref={riskHref}
        />
        <MetricCard
          label="Deutschland Kerosinseite"
          value="Seite öffnen"
          hint="Serverseitige Preisansicht für Brent / Jet global / EU-Jet-Proxy / Carbon mit 1d/7d/30d"
          cardHref="/de/prices/germany-jet-fuel"
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <InfoCard title="Dashboard-Verantwortung" subtitle="Produktoberfläche für Entscheidungsunterstützung">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Migrationsregel" subtitle="Von Prototype zu Product">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>1. Erst vertikale End-to-End Slice für market + scenarios, dann Funktionsumfang erweitern.</p>
            <p>2. Bei API-Ausfall bleibt eine sichere Fallback-Darstellung aktiv.</p>
            <p>3. Als Nächstes Vergleichs- und Sweep-Ansichten auf dasselbe Workspace-Modell konsolidieren.</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="Aktuelle Szenarien" subtitle="Quelle: FastAPI / PostgreSQL">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-300">
              {readModel.recentScenarioNames.map((name) => (
                <li key={name}>• {name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-300">
              Noch keine gespeicherten Szenarien. Lege ein Szenario über die API an, um CRUD Ende-zu-Ende zu prüfen.
            </p>
          )}
        </InfoCard>
      </section>

      <section className="mt-12">
        <PolicyTimelineWithMarketTime locale="de" />
      </section>
    </Shell>
  );
}
