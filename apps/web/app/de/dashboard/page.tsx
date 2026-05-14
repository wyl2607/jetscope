import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const priorities = [
  'Echtzeit-Marktdaten: Brent / Jet-Proxy / Carbon-Proxy',
  'Einheitliche Szenarioberechnung: Preis, Foerderung, CO2-Preis, Break-even',
  'Admin-Steuerung: Routenannahmen, Policy-Parameter, Datenquellen',
  'Export und Reporting: Diagramme, Snapshots, Szenariovergleich'
];

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dashboard (DE)',
  description:
    'Deutsches JetScope-Dashboard mit Live-Marktsnapshot, Szenarioregister und Risikosignal fuer SAF-gegen-Kerosin Entscheidungen.',
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

export default async function GermanDashboardPage() {
  const readModel = await getDashboardReadModel();
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;

  const riskColor =
    risk?.level === 'alert' ? 'text-rose-300' : risk?.level === 'watch' ? 'text-amber-300' : 'text-emerald-300';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? 'Noch kein belastbares History-Signal'
      : `level=${risk.level} | as_of=${formatAsOf(risk.latestAsOf)} | samples=${risk.sampleCount}`;

  return (
    <Shell
      eyebrow="Produkt-Dashboard (DE)"
      title="JetScope Entscheidungscockpit"
      description="Deutsche Einstiegsseite fuer SAF-vs-Kerosin Entscheidungen auf Basis von FastAPI + PostgreSQL Snapshot und Szenario-Registry."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Markt-Snapshot"
          value={`${formatNumber(market.brent_usd_per_bbl)} USD/bbl`}
          hint={`Jet (global) ${formatNumber(market.jet_usd_per_l, 3)} USD/L | Jet (EU Proxy) ${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)} USD/L | Carbon ${formatNumber(market.carbon_proxy_usd_per_t)} USD/tCO2`}
        />
        <MetricCard
          label="Szenario-Modus"
          value={`${readModel.scenarioCount}`}
          hint="Daten aus /v1/workspaces/{slug}/scenarios"
        />
        <MetricCard label="Admin-Kontrolle" value="Erforderlich" hint="Routenkosten, Policy-Parameter, Quellenpflege" />
        <MetricCard
          label="Delivery-Lane"
          value={readModel.isFallback ? 'Fallback' : 'Live Slice'}
          hint={
            readModel.isFallback
              ? `API fallback: ${readModel.error ?? 'unknown'}`
              : `source status: ${readModel.market.source_status.overall} | freshness=${freshness.level} (${freshness.minutes}m)`
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
          value="Seite oeffnen"
          hint="SSR-Preisansicht fuer Brent / Jet global / Jet EU Proxy / Carbon mit 1d/7d/30d"
          cardHref="/de/prices/germany-jet-fuel"
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <InfoCard title="Dashboard-Verantwortung" subtitle="Produktoberflaeche fuer Entscheidungsunterstuetzung">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Migrationsregel" subtitle="Von Prototype zu Product">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>1. Erst vertikale End-to-End Slice fuer market + scenarios, dann Funktionsumfang erweitern.</p>
            <p>2. Bei API-Ausfall bleibt eine sichere Fallback-Darstellung aktiv.</p>
            <p>3. Als naechstes compare/sweep auf dasselbe Workspace-Modell konsolidieren.</p>
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
              Noch keine gespeicherten Szenarien. Lege ein Szenario ueber die API an, um CRUD Ende-zu-Ende zu pruefen.
            </p>
          )}
        </InfoCard>
      </section>

      <section className="mt-12">
        <PolicyTimelineWithMarketTime />
      </section>
    </Shell>
  );
}
