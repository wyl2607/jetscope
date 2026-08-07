import { MetricCard } from '@/components/cards';
import { localeCopy, PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
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

type PipelineState = 'disabled' | 'waiting' | 'not_found' | 'error' | 'ready';

function getPipelineState(enabled: boolean, status: string, signalCount: number): PipelineState {
  if (!enabled) return 'disabled';
  if (status === 'error') return 'error';
  if (status === 'not_found') return 'not_found';
  if (signalCount === 0) return 'waiting';
  return 'ready';
}

function pipelineStateLabel(state: PipelineState): string {
  if (state === 'disabled') return 'Deaktiviert';
  if (state === 'waiting') return 'Wartet auf Signale';
  if (state === 'not_found') return 'Nicht bereitgestellt';
  if (state === 'error') return 'Fehler';
  return 'Aktiv';
}

function pipelineStateTone(state: PipelineState): string {
  if (state === 'disabled') return 'border-accent bg-accent-soft text-accent';
  if (state === 'waiting') return 'border-warning bg-warning-soft text-warning';
  if (state === 'not_found') return 'border-warning border-dashed bg-warning-soft text-warning';
  if (state === 'error') return 'border-danger bg-danger-soft text-danger';
  return 'border-success bg-success-soft text-success';
}

function pipelineValueTone(state: PipelineState): string {
  if (state === 'disabled') return 'text-accent';
  if (state === 'waiting' || state === 'not_found') return 'text-warning';
  if (state === 'error') return 'text-danger';
  return 'text-success';
}

function pipelineStateDetail(state: PipelineState, message: string | null): string {
  if (state === 'disabled') {
    return 'Die Forschungspipeline ist deaktiviert. Diese Seite behauptet keine laufende AI-Analyse.';
  }
  if (state === 'waiting') {
    return 'Die Forschungs-API ist aktiviert, aber es gibt noch kein persistiertes Signal. Der tägliche Forschungsjob muss erst Evidenz liefern.';
  }
  if (state === 'not_found') {
    return 'Der Forschungsdienst ist noch nicht bereitgestellt oder in dieser Umgebung nicht auffindbar. Ein leeres Ergebnis ist kein Marktbefund.';
  }
  if (state === 'error') return `Forschungs-API-Fehler: ${message ?? 'unbekannte Ursache'}. Forschungsergebnisse erst nach Wiederherstellung nutzen.`;
  return 'Die Forschungs-API ist aktiviert; diese Seite zeigt persistierte Signale aus dem aktuellen Prüfzeitraum.';
}

function toneForImpact(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'border-success bg-success-soft text-success';
  if (impact === 'negative') return 'border-danger bg-danger-soft text-danger';
  if (impact === 'neutral') return 'border-line bg-surface text-muted';
  return 'border-warning bg-warning-soft text-warning';
}

function impactLabel(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'Positiv';
  if (impact === 'negative') return 'Negativ';
  if (impact === 'neutral') return 'Neutral';
  return 'Unbekannt';
}

function formatTime(value: string | null): string {
  if (value == null) return localeCopy('de').noData;
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
  const latestSignal = result.signals.reduce<typeof result.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    const signalTime = signal.published_at == null ? Number.NEGATIVE_INFINITY : new Date(signal.published_at).getTime();
    const latestTime = latest.published_at == null ? Number.NEGATIVE_INFINITY : new Date(latest.published_at).getTime();
    return signalTime > latestTime ? signal : latest;
  }, null);
  const positiveCount = result.signals.filter((signal) => signal.impact_direction === 'positive').length;
  const negativeCount = result.signals.filter((signal) => signal.impact_direction === 'negative').length;
  const neutralCount = result.signals.filter((signal) => signal.impact_direction === 'neutral').length;
  const state = getPipelineState(AI_RESEARCH_ENABLED, result.status, result.signals.length);
  const resultMessage = result.status === 'error' ? result.message : null;
  const asOf = state === 'ready' ? latestSignal?.published_at ?? null : null;
  const latestSignalValue = latestSignal ? formatTime(latestSignal.published_at) : 'Kein Signal';
  const latestSignalHint = latestSignal
    ? signalTitle(latestSignal, 0)
    : 'Für den aktuellen Prüfzeitraum ist kein persistiertes Forschungssignal verfügbar.';

  return (
    <PageTemplate
      locale="de"
      eyebrow="AI-Forschungspipeline"
      title="Forschungswerkstatt"
      question="Repräsentieren die heutigen Forschungssignale ausreichend, warum sich der Markt bewegt?"
      asOf={asOf}
    >
      <SignalRow label="Forschungsergebnisse">
        <MetricCard
          label="Pipeline-Status"
          value={pipelineStateLabel(state)}
          valueClassName={pipelineValueTone(state)}
          hint={pipelineStateDetail(state, resultMessage)}
        />
        <MetricCard
          label="Signalanzahl"
          value={`${result.signals.length}`}
          hint={`Positiv ${positiveCount} | Negativ ${negativeCount} | Neutral ${neutralCount}`}
        />
        <MetricCard label="Neuestes Signal" value={latestSignalValue} hint={latestSignalHint} />
        <MetricCard
          label="Nutzungsgrenze"
          value={AI_RESEARCH_ENABLED ? 'Evidenzebene' : 'Nur Grenze'}
          hint="Forschung erklärt mögliche Ursachen; sie ersetzt nie Markt-, Reserve-, Szenario- oder Quellenprüfung."
        />
      </SignalRow>

      <Panel
        locale="de"
        title="Forschungsstatus"
        why="Konfiguration, Warten, fehlende Bereitstellung und Fehler müssen sichtbar getrennt bleiben, bevor ein Signal zitiert wird."
      >
        <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
          <p className="font-semibold">{pipelineStateLabel(state)}</p>
          <p className="mt-1">{pipelineStateDetail(state, resultMessage)}</p>
        </div>
      </Panel>

      <Panel
        locale="de"
        title="Entscheidungsnotiz"
        why="Forschung ist erklärende Evidenz, keine autonome Empfehlung für Markt- oder Beschaffungsentscheidungen."
      >
        {state !== 'ready' ? (
          <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
            {pipelineStateDetail(state, resultMessage)}
          </div>
        ) : (
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <p className="rounded-xl border border-accent bg-accent-soft p-3">Aktiv: <span className="tabular-nums">{result.signals.length}</span></p>
            <p className="rounded-xl border border-success bg-success-soft p-3">Positiv: <span className="tabular-nums">{positiveCount}</span></p>
            <p className="rounded-xl border border-danger bg-danger-soft p-3">Negativ: <span className="tabular-nums">{negativeCount}</span></p>
            <p className="rounded-xl border border-line bg-surface p-3">Neutral: <span className="tabular-nums">{neutralCount}</span></p>
          </div>
        )}
      </Panel>

      <Panel locale="de" title="Evidenzaktionen" why="Jedes Forschungssignal muss zurück in die Entscheidungskette und zur prüfbaren Quelle führen.">
        <div className="space-y-3">
          {actionLinks.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-semibold text-ink">{action.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel locale="de" title="Signalliste" why="Die einzelnen Signale zeigen Richtung, Quelle und Konfidenz statt nur eine aggregierte Aussage.">
        {state !== 'ready' ? (
          <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
            {pipelineStateDetail(state, resultMessage)}
          </div>
        ) : (
          <div className="space-y-4">
            {result.signals.map((signal, index) => (
              <article key={signal.id} className="rounded-xl border border-line bg-surface-muted p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-xl border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneForImpact(signal.impact_direction)}`}>
                    {impactLabel(signal.impact_direction)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">{signal.signal_type}</span>
                  <span className="text-xs tabular-nums text-muted">{formatTime(signal.published_at)}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{signalTitle(signal, index)}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{signalSummary()}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                  Konfidenz <span className="tabular-nums">{(signal.confidence * 100).toFixed(0)}%</span>
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'research-signals',
            label: state === 'error' ? 'Forschungs-Signal-API aktuell nicht verfügbar' : 'Forschungs-Signal-Read-Model (Richtung, Konfidenz und Veröffentlichungszeit)',
            asOf,
            basis: 'derived'
          },
          {
            id: 'research-pipeline-config',
            label: 'Aktivierung und Bereitstellungsstatus der Forschungspipeline',
            basis: 'assumption'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          'Forschung erklärt mögliche Ursachen; sie ersetzt keine Markt-, Reserve-, Szenario- oder Quellenprüfung.',
          'Deaktiviert, wartend, nicht bereitgestellt oder fehlerhaft bedeutet: kein gültiger Datenstand. Der Zeitstempel kommt nur vom neuesten Signal.',
          'Ein leeres Ergebnis ist kein Beleg dafür, dass sich der Markt nicht bewegt hat.'
        ]}
      />
    </PageTemplate>
  );
}
