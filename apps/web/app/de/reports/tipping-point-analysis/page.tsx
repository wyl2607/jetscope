import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { AI_RESEARCH_ENABLED, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Kipppunktbericht',
  description:
    'Deutscher JetScope-Berichtsdetailblick für SAF-Kipppunkt, Quellenvertrauen, Reservestress und Forschungsstatus.',
  path: '/de/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

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

function researchPosture(status: string, count: number): string {
  if (!AI_RESEARCH_ENABLED) return 'deaktivierte Grenze';
  if (status === 'error') return 'eingeschränkt';
  if (status === 'not_found') return 'nicht bereitgestellt';
  return count > 0 ? 'mit Signalen belegt' : 'wartet auf Signale';
}

export default async function GermanTippingPointReportPage() {
  const [readModel, reserve, events, research] = await Promise.all([
    getDashboardReadModel('de'),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 }),
    getResearchSignals()
  ]);
  const sourceStatus = readModel.market.source_status;
  const tippingPoint = readModel.tippingPoint;
  const decision = readModel.airlineDecision;
  const reserveWeeks = reserve?.coverage_weeks ?? readModel.reserve?.coverage_weeks ?? null;
  const latestEvent = events[0] ?? null;
  const fossilPrice =
    tippingPoint?.effective_fossil_jet_usd_per_l ??
    readModel.market.values.jet_eu_proxy_usd_per_l ??
    readModel.market.values.jet_usd_per_l;
  const hefaPathway = tippingPoint?.pathways.find((pathway) => pathway.pathway_key === 'hefa') ?? tippingPoint?.pathways[0];
  const switchProbability = Math.round(
    Math.max(
      decision?.probabilities.buy_spot_saf ?? 0,
      decision?.probabilities.sign_long_term_offtake ?? 0
    ) * 100
  );
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(research.status, research.signals.length);

  return (
    <Shell
      locale="de"
      eyebrow="Berichtsdetail"
      title="Kipppunktbericht"
      description="Ein lokalisierter, quellengestützter Berichtsblick darauf, ob SAF vom Compliance-Kostenpunkt zur operativen Logik wird."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Effektive fossile Kosten"
          value={formatPrice(fossilPrice)}
          hint={`Signal: ${tippingPoint?.signal ?? 'Prüfung'} | Beimischung ${formatPercent(tippingPoint?.inputs.blend_rate_pct)}`}
        />
        <MetricCard
          label="SAF-Pfadabstand"
          value={hefaPathway ? `${formatNumber(hefaPathway.spread_low_pct, 0)}-${formatNumber(hefaPathway.spread_high_pct, 0)}%` : 'n/a'}
          hint={hefaPathway ? `${hefaPathway.display_name} Nettokosten ${formatPrice(hefaPathway.net_cost_low_usd_per_l)}-${formatPrice(hefaPathway.net_cost_high_usd_per_l)}` : 'Kein Pfadmodell von der API zurückgegeben.'}
        />
        <MetricCard
          label="Reservestress"
          value={reserveWeeks == null ? 'n/a' : `${formatNumber(reserveWeeks, 1)} Wochen`}
          hint={`EU-Reservehaltung: ${reserveStressLabel(reserve?.stress_level ?? readModel.reserve?.stress_level)}`}
        />
        <MetricCard
          label="Entscheidungswahrscheinlichkeit"
          value={`${switchProbability}%`}
          hint="Höchster Wert aus Spot-SAF-Kauf und langfristiger Abnahme."
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="Kernthese" subtitle="Evidenzkette für die Prüfung">
          <div className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              JetScope behandelt den Kipppunkt als Zusammenlaufen von fossilen Kraftstoffkosten, Kohlenstoffexponierung,
              Reservestress und SAF-Pfadabstand. Diese Seite nutzt dieselben FastAPI-gestützten Read Models wie das
              Cockpit und hält Quellenqualität sichtbar, bevor ein Bericht als Entscheidungsgrundlage genutzt wird.
            </p>
            <p>
              Der aktuelle Quellenstatus ist <strong>{sourceStatusLabel(sourceStatus.overall)}</strong> mit
              Quellenvertrauen von <strong>{sourceConfidence}</strong>. Bei Fallback- oder eingeschränkten Zeilen bleibt
              der Bericht lesbar, muss aber vor Veröffentlichung durch die Quellenprüfung.
            </p>
          </div>
        </InfoCard>

        <InfoCard title="Quellenvertrauen" subtitle="Startprüfung">
          <dl className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-4">
              <dt>Marktstatus</dt>
              <dd className="font-semibold text-slate-950">{sourceStatusLabel(sourceStatus.overall)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Fallback-Rate</dt>
              <dd className="font-semibold text-slate-950">{formatPercent(sourceStatus.fallback_rate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Letztes Ereignis</dt>
              <dd className="font-semibold text-slate-950">{latestEvent ? latestEvent.event_type.toLowerCase() : 'keins'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Forschungsstatus</dt>
              <dd className="font-semibold text-slate-950">{researchStatus}</dd>
            </div>
          </dl>
        </InfoCard>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        {[
          {
            title: 'Quellen prüfen',
            description: 'Live-, Proxy-, Fallback- und eingeschränkte Eingaben prüfen, bevor der Bericht extern genutzt wird.',
            href: '/de/sources?filter=review' as Route
          },
          {
            title: 'Szenarioannahmen vergleichen',
            description: 'Gespeicherte Annahmen und geschützte Schreibgrenzen prüfen, bevor sich die Beschaffungshaltung ändert.',
            href: '/de/scenarios' as Route
          },
          {
            title: 'Zur Berichtswerkstatt zurückkehren',
            description: 'Startposition und Berichtskatalog auf der Übersichtsseite erneut prüfen.',
            href: '/de/reports' as Route
          }
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70 transition hover:border-sky-300 hover:bg-sky-50"
          >
            <p className="text-base font-semibold text-slate-950">{action.title}</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{action.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
