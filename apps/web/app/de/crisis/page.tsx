import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getCrisisBriefReadModel, type CrisisBriefReadModel } from '@/lib/crisis-brief-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Krisenbrief',
  description:
    'Deutscher JetScope-Krisenmonitor für EU-Kerosin-Reservestress, Quellenvertrauen, Kippereignisse und Forschungsstatus.',
  path: '/de/crisis',
  alternateLanguages: {
    'zh-CN': '/crisis',
    de: '/de/crisis',
    en: '/en/crisis'
  }
});

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

function formatAsOf(value?: string | null): string {
  if (!value) return 'nicht verfügbar';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('de-DE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
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
  if (status === 'disabled') return 'deaktivierte Grenze';
  if (status === 'empty') return 'wartet auf Signale';
  return count > 0 ? 'mit Signalen belegt' : 'wartet auf Signale';
}

function actionHref(readModel: CrisisBriefReadModel, id: string, fallback: Route): Route {
  return (readModel.actions.find((action) => action.id === id)?.href ?? fallback) as Route;
}

export default async function GermanCrisisPage() {
  const readModel = await getCrisisBriefReadModel('de');

  const sourceStatus = readModel.sourceStatus;
  const latestEvent = readModel.tippingEvents[0] ?? null;
  const reserveWeeks = readModel.reserve?.coverage_weeks ?? null;
  const reserveConfidence = readModel.reserve?.confidence_score ?? null;
  const reserveSourceName = readModel.reserve?.source_name ?? 'Fallback-Szenariobasis';
  const fossilPrice = readModel.fossilJetUsdPerL;
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(readModel.research.status, readModel.research.signal_count);
  const reviewSourcesRoute = actionHref(readModel, 'review_sources', '/de/sources?filter=review' as Route);
  const reportRoute = actionHref(readModel, 'open_report', '/de/reports/tipping-point-analysis' as Route);
  const scenariosRoute = actionHref(readModel, 'review_scenarios', '/de/scenarios' as Route);

  return (
    <Shell
      locale="de"
      eyebrow="Krisenmonitor"
      title="Krisenbrief"
      description="Quellengestützter Überblick über EU-Reservestress, Marktvertrauen, SAF-Kippereignisse und nötige Evidenzübergaben vor operativen Entscheidungen."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reservestress"
          value={reserveWeeks == null ? 'n/a' : `${formatNumber(reserveWeeks, 1)} Wochen`}
          hint={`EU-Reservehaltung: ${reserveStressLabel(readModel.reserve?.stress_level)} | ${reserveSourceName}`}
        />
        <MetricCard
          label="Quellenvertrauen"
          value={sourceConfidence}
          hint={`Marktstatus ${sourceStatusLabel(sourceStatus.overall)} | Reservevertrauen ${formatPercent((reserveConfidence ?? 0) * 100)}`}
          cardHref={reviewSourcesRoute}
        />
        <MetricCard
          label="Kippereignisse"
          value={`${readModel.tippingEvents.length}`}
          hint={latestEvent ? `${latestEvent.event_type.toLowerCase()} | ${latestEvent.saf_pathway.toUpperCase()} | ${formatAsOf(latestEvent.observed_at)}` : 'Keine Ereignisse im aktuellen Prüffenster.'}
        />
        <MetricCard
          label="Forschungsstatus"
          value={researchStatus}
          hint={readModel.research.signal_count ? `${readModel.research.signal_count} Forschungssignale verfügbar.` : 'Die Seite zeigt die Forschungsgrenze, statt Evidenz zu erfinden.'}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard title="Operative Lage" subtitle="Kraftstoffstress, Reserven und Quellenqualität zusammengeführt">
          <div className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              Der aktuelle fossile Kostenanker liegt bei <strong>{formatPrice(fossilPrice)}</strong>. JetScope stellt
              diesen Wert neben EU-Reserveabdeckung und Quellenvertrauen, damit Prüfer Live-Evidenz von Fallback-Lagen
              trennen können, bevor Beschaffung oder SAF-Annahmen geändert werden.
            </p>
            <p>
              Der Krisenbrief kommt aus dem FastAPI-Crisis-Brief-Vertrag. Die Seite zeigt dadurch eine kohärente
              operative Lage, ohne Reserve-, Quellen-, Kippereignis- und Forschungsaggregation in der Anzeige zu duplizieren.
            </p>
          </div>
        </InfoCard>

        <InfoCard title="Evidenzdisziplin" subtitle="Der Krisenbrief führt in prüfbare nächste Schritte">
          <dl className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-4">
              <dt>Marktfrische</dt>
              <dd className="font-semibold text-slate-950">
                {typeof sourceStatus.freshness_minutes === 'number' ? `${sourceStatus.freshness_minutes} Min.` : 'Prüfung'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Fallback-Rate</dt>
              <dd className="font-semibold text-slate-950">{formatPercent(sourceStatus.fallback_rate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Reservezeitpunkt</dt>
              <dd className="font-semibold text-slate-950">{formatAsOf(readModel.reserve?.generated_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Vertragsstatus</dt>
              <dd className="font-semibold text-slate-950">{readModel.error ? 'Fallback' : 'verbunden'}</dd>
            </div>
          </dl>
        </InfoCard>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        {[
          {
            title: 'Quellennachweise prüfen',
            description: 'Fallback-, Proxy-, eingeschränkte und volatile Zeilen prüfen, bevor das Krisensignal operativ genutzt wird.',
            href: reviewSourcesRoute
          },
          {
            title: 'Lokalen Bericht öffnen',
            description: 'Vom Kurzbrief in den quellengestützten Kipppunktbericht mit längerer Prüferzählung wechseln.',
            href: reportRoute
          },
          {
            title: 'Szenarien prüfen',
            description: 'Gespeicherte Annahmen gegen aktuellen Reservestress und Marktvertrauen halten, bevor sich der Plan ändert.',
            href: scenariosRoute
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
