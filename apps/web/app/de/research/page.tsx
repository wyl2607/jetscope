import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { AI_RESEARCH_ENABLED, getResearchSignals, type ResearchSignal } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Forschungswerkstatt',
  description:
    'Deutsche JetScope-Forschungswerkstatt für AI-Research-Pipeline-Status, Signalanzahl, Konfidenz und Evidenzübergaben.',
  path: '/de/research',
  alternateLanguages: {
    'zh-CN': '/research',
    de: '/de/research',
    en: '/en/research'
  }
});

const actionLinks: Array<{ label: string; href: Route; description: string }> = [
  {
    label: 'Berichtswerkstatt öffnen',
    href: '/de/reports' as Route,
    description: 'Forschungssignale zurück in Quellenstatus, Szenarien, Risikosignale und Berichtseinstiege einordnen.'
  },
  {
    label: 'Quellennachweise prüfen',
    href: '/de/sources?filter=review' as Route,
    description:
      'Marktprovenienz, Proxy-Annahmen, Fallback-Zeilen und Volatilität prüfen, bevor Forschungssignale zitiert werden.'
  },
  {
    label: 'Startbereitschaft prüfen',
    href: '/de/admin' as Route,
    description:
      'Forschungskonfiguration, Admin-Token und geschützte Refresh-Bereitschaft vor operativer Nutzung bestätigen.'
  }
];

function toneForImpact(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (impact === 'negative') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (impact === 'neutral') return 'border-slate-200 bg-white text-slate-700';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function impactLabel(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'Positiv';
  if (impact === 'negative') return 'Negativ';
  if (impact === 'neutral') return 'Neutral';
  return 'Unbekannt';
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function hasCjkText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function signalTitle(signal: ResearchSignal, index: number): string {
  if (!hasCjkText(signal.title)) return signal.title;
  return `Forschungssignal ${index + 1}`;
}

function signalSummary(): string {
  return 'Für dieses Signal liegt noch keine geprüfte deutsche Zusammenfassung vor. Vor Nutzung im Bericht Originalquelle, Marktkontext und Quellenstatus gegenprüfen.';
}

export default async function GermanResearchPage() {
  const result = await getResearchSignals();
  const latestSignal = result.signals[0] ?? null;
  const positiveCount = result.signals.filter((signal) => signal.impact_direction === 'positive').length;
  const negativeCount = result.signals.filter((signal) => signal.impact_direction === 'negative').length;
  const neutralCount = result.signals.filter((signal) => signal.impact_direction === 'neutral').length;
  const pipelineStatus = AI_RESEARCH_ENABLED
    ? result.status === 'error'
      ? 'Fehler'
      : result.signals.length
        ? 'Aktiv'
        : 'Wartet'
    : 'Deaktiviert';
  const pipelineHint = AI_RESEARCH_ENABLED
    ? 'Die Forschungs-API ist aktiviert; diese Seite zeigt persistierte Signale aus dem aktuellen Prüfzeitraum.'
    : 'Forschungspipeline ist deaktiviert; die Seite bleibt prüfbar, ohne laufende AI-Analyse zu behaupten.';
  const usageMode = AI_RESEARCH_ENABLED ? 'Evidenzebene' : 'Nur Grenze';
  const latestSignalValue = latestSignal ? formatTime(latestSignal.published_at) : 'Kein Signal';
  const latestSignalHint = latestSignal
    ? signalTitle(latestSignal, 0)
    : 'Für den aktuellen Prüfzeitraum ist kein persistiertes Forschungssignal verfügbar.';

  return (
    <Shell
      locale="de"
      eyebrow="AI-Forschungspipeline"
      title="Forschungswerkstatt"
      description="Artikelnahe Forschung in eine prüfbare Erklärungsebene für Entscheidungen überführen; bei deaktivierter Pipeline bleibt die Grenze sichtbar."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pipeline-Status" value={pipelineStatus} hint={pipelineHint} />
        <MetricCard
          label="Signalanzahl"
          value={`${result.signals.length}`}
          hint={`Positiv ${positiveCount} | Negativ ${negativeCount} | Neutral ${neutralCount}`}
        />
        <MetricCard label="Neuestes Signal" value={latestSignalValue} hint={latestSignalHint} />
        <MetricCard
          label="Nutzungsgrenze"
          value={usageMode}
          hint="Forschung erklärt mögliche Ursachen; sie ersetzt nie Markt-, Reserve-, Szenario- oder Quellenprüfung."
        />
      </section>

      {!AI_RESEARCH_ENABLED ? (
        <section className="mt-8 rounded-2xl border border-dashed border-sky-300 bg-sky-50 p-6">
          <p className="text-sm font-semibold uppercase text-sky-800">Forschungspipeline aktivieren</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
            Nach Deployment des Backend-Forschungsjobs <code>JETSCOPE_AI_RESEARCH_ENABLED=true</code> setzen. Bis dahin bleibt JetScope navigierbar und ehrlich über den deaktivierten Zustand.
          </p>
        </section>
      ) : null}

      {result.status === 'error' ? (
        <section className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          Forschungs-API ist aktuell nicht verfügbar. Forschungssignale erst nach Wiederherstellung für Berichtserklärungen nutzen.
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <InfoCard title="Entscheidungsnotiz" subtitle="Forschung ist erklärende Evidenz, keine autonome Empfehlung">
          {result.status === 'error' ? (
            <p className="text-sm leading-7 text-slate-700">
              Die Forschungsebene ist eingeschränkt. Markt- und Reserve-Evidenz sichtbar halten, aber Forschungssignale erst nach Wiederherstellung zur Erklärung von Wahrscheinlichkeitsänderungen nutzen.
            </p>
          ) : result.signals.length === 0 ? (
            <p className="text-sm leading-7 text-slate-700">
              Kein aktives Forschungssignal verfügbar. Das ist erwartbar, solange die Pipeline deaktiviert ist oder der tägliche Ingestion-Job noch keine neue Evidenz persistiert hat.
            </p>
          ) : (
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <p className="rounded-md border border-sky-200 bg-sky-50 p-3">Aktiv: {result.signals.length}</p>
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3">Positiv: {positiveCount}</p>
              <p className="rounded-md border border-rose-200 bg-rose-50 p-3">Negativ: {negativeCount}</p>
              <p className="rounded-md border border-slate-200 bg-white p-3">Neutral: {neutralCount}</p>
            </div>
          )}
        </InfoCard>

        <InfoCard title="Evidenzaktionen" subtitle="Jedes Forschungssignal muss zurück in die Entscheidungskette">
          <div className="space-y-3">
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

      <section className="mt-8">
        <InfoCard title="Signalliste" subtitle="Aktuelles Read-Model-Ergebnis">
          {result.status !== 'error' && result.signals.length === 0 ? (
            <p className="text-sm leading-7 text-slate-700">
              Für diesen Prüfzeitraum wurden keine Forschungssignale persistiert. Berichte sollen weiter auf Markt-, Reserve-, Szenario- und Quellen-Evidenz aufbauen.
            </p>
          ) : result.status === 'error' ? (
            <p className="text-sm leading-7 text-slate-700">
              Die Signalliste bleibt verborgen, bis die Forschungs-API wiederhergestellt ist.
            </p>
          ) : (
            <div className="space-y-4">
              {result.signals.map((signal, index) => (
                <article key={signal.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${toneForImpact(signal.impact_direction)}`}>
                      {impactLabel(signal.impact_direction)}
                    </span>
                    <span className="text-xs uppercase text-slate-500">{signal.signal_type}</span>
                    <span className="text-xs text-slate-500">{formatTime(signal.published_at)}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{signalTitle(signal, index)}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{signalSummary()}</p>
                  <p className="mt-4 text-xs uppercase text-slate-500">
                    Konfidenz {(signal.confidence * 100).toFixed(0)}%
                  </p>
                </article>
              ))}
            </div>
          )}
        </InfoCard>
      </section>
    </Shell>
  );
}
