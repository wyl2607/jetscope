import { MetricCard } from '@/components/cards';
import { localeCopy, PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { SourceFooter } from '@/components/source-footer';
import { messagesFor, type Locale, type ResearchMessages } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import {
  AI_RESEARCH_ENABLED,
  buildResearchDecisionBrief,
  getResearchSignals,
  type ResearchSignal
} from '@/lib/research-signals-read-model';
import type { Route } from 'next';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

/**
 * One research workbench for three real routes. Copy and locale-specific
 * behaviour (actions, decision-brief mode, panel order, signal-script rules)
 * come from `src/locales/*.json`. The thin `app/research`, `app/de/research`
 * and `app/en/research` pages pass the locale they already own; they do not
 * rewrite the public URL.
 */

type PipelineState = 'disabled' | 'waiting' | 'not_found' | 'error' | 'ready';

const DATE_TAGS = { zh: 'zh-CN', de: 'de-DE', en: 'en-US' } as const;

const DATE_OPTIONS: Record<Locale, Intl.DateTimeFormatOptions> = {
  zh: { month: '2-digit', day: '2-digit', year: 'numeric' },
  de: { day: '2-digit', month: '2-digit', year: 'numeric' },
  en: { month: 'short', day: '2-digit', year: 'numeric' }
};

const PANEL_IDS = ['status', 'decision', 'signals', 'actions'] as const;
type PanelId = (typeof PANEL_IDS)[number];

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function hrefFor(locale: Locale, navId: string, suffix = ''): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Research has no ${locale} path for ${navId}`);
  }
  return `${path}${suffix}` as Route;
}

function getPipelineState(enabled: boolean, status: string, signalCount: number): PipelineState { // figure-contract-lint-ignore: pipeline occupancy, not a measurement
  if (!enabled) return 'disabled';
  if (status === 'error') return 'error';
  if (status === 'not_found') return 'not_found';
  if (signalCount === 0) return 'waiting';
  return 'ready';
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

function pipelineStateDetail(copy: ResearchMessages, state: PipelineState, message: string | null): string {
  if (state === 'error') {
    return fill(copy.pipeline.error.detail, { message: message ?? copy.pipeline_error_unknown });
  }
  return copy.pipeline[state].detail;
}

function toneForImpact(impact: ResearchSignal['impact_direction']): string {
  if (impact === 'positive') return 'border-success bg-success-soft text-success';
  if (impact === 'negative') return 'border-danger bg-danger-soft text-danger';
  if (impact === 'neutral') return 'border-line bg-surface text-muted';
  return 'border-warning bg-warning-soft text-warning';
}

function formatTime(value: string | null, locale: Locale): string {
  if (value == null) return localeCopy(locale).noData;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(DATE_TAGS[locale], DATE_OPTIONS[locale]);
}

function formatConfidence(value: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return `${(value * 100).toFixed(0)}%`;
}

function hasCjkText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function signalTitle(copy: ResearchMessages, signal: ResearchSignal, index: number): string { // figure-contract-lint-ignore: list index for CJK title fallback, not a measurement
  if (!copy.cjk_title_template || !hasCjkText(signal.title)) return signal.title;
  return fill(copy.cjk_title_template, { n: String(index + 1), signal_type: signal.signal_type });
}

function signalSummary(copy: ResearchMessages, signal: ResearchSignal): string {
  if (copy.summary_mode === 'placeholder') return copy.summary_placeholder;
  if (copy.summary_mode === 'en_if_clean') {
    if (signal.summary_en && !hasCjkText(signal.summary_en)) return signal.summary_en;
    if (signal.summary_en) return copy.summary_en_cjk;
    return copy.summary_en_missing;
  }
  return signal.summary_cn;
}

function isPanelId(value: string): value is PanelId {
  return (PANEL_IDS as readonly string[]).includes(value);
}

export async function ResearchPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).research;
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
  const brief = copy.decision_brief_mode === 'card' ? buildResearchDecisionBrief(result) : null;
  const state = getPipelineState(AI_RESEARCH_ENABLED, result.status, result.signals.length);
  const resultMessage = result.status === 'error' ? result.message : null;
  const asOf = state === 'ready' ? latestSignal?.published_at ?? null : null;
  const latestSignalValue = latestSignal ? formatTime(latestSignal.published_at, locale) : copy.metrics.latest_none;
  const latestSignalHint = latestSignal
    ? signalTitle(copy, latestSignal, 0)
    : copy.metrics.latest_none_hint;

  const statusPanel = (
    <Panel locale={locale} title={copy.panels.status.title} why={copy.panels.status.why}>
      <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
        <p className="font-semibold">{copy.pipeline[state].label}</p>
        <p className="mt-1">{pipelineStateDetail(copy, state, resultMessage)}</p>
      </div>
    </Panel>
  );

  const decisionPanel = (
    <Panel locale={locale} title={copy.panels.decision.title} why={copy.panels.decision.why}>
      {copy.decision_brief_mode === 'card' && brief ? (
        <ResearchDecisionBriefCard brief={brief} showLink={false} />
      ) : state !== 'ready' ? (
        <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
          {pipelineStateDetail(copy, state, resultMessage)}
        </div>
      ) : (
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <p className="rounded-xl border border-accent bg-accent-soft p-3">
            {copy.counts.active}: <span className="tabular-nums">{result.signals.length}</span>
          </p>
          <p className="rounded-xl border border-success bg-success-soft p-3">
            {copy.counts.positive}: <span className="tabular-nums">{positiveCount}</span>
          </p>
          <p className="rounded-xl border border-danger bg-danger-soft p-3">
            {copy.counts.negative}: <span className="tabular-nums">{negativeCount}</span>
          </p>
          <p className="rounded-xl border border-line bg-surface p-3">
            {copy.counts.neutral}: <span className="tabular-nums">{neutralCount}</span>
          </p>
        </div>
      )}
    </Panel>
  );

  const actionsPanel = (
    <Panel locale={locale} title={copy.panels.actions.title} why={copy.panels.actions.why}>
      <div className="space-y-3">
        {copy.actions.map((action) => (
          <Link
            key={action.id}
            href={hrefFor(locale, action.nav_id, action.suffix)}
            className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
          >
            <p className="font-semibold text-ink">{action.label}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
          </Link>
        ))}
      </div>
    </Panel>
  );

  const signalsPanel = (
    <Panel locale={locale} title={copy.panels.signals.title} why={copy.panels.signals.why}>
      {state !== 'ready' ? (
        <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
          {pipelineStateDetail(copy, state, resultMessage)}
        </div>
      ) : (
        <div className="space-y-4">
          {result.signals.map((signal, index) => (
            <article key={signal.id} className="rounded-xl border border-line bg-surface-muted p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-xl border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneForImpact(signal.impact_direction)}`}>
                  {copy.impacts[signal.impact_direction]}
                </span>
                <span className="text-xs uppercase tracking-[0.18em] text-muted">{signal.signal_type}</span>
                <span className="text-xs tabular-nums text-muted">{formatTime(signal.published_at, locale)}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{signalTitle(copy, signal, index)}</h3>
              {copy.summary_mode === 'both' ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-muted">{signal.summary_cn}</p>
                  <p className="mt-3 text-sm leading-7 text-muted">{signal.summary_en}</p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-7 text-muted">{signalSummary(copy, signal)}</p>
              )}
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                {copy.confidence} <span className="tabular-nums">{formatConfidence(signal.confidence)}</span>
              </p>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );

  const panels: Record<PanelId, ReactNode> = {
    status: statusPanel,
    decision: decisionPanel,
    actions: actionsPanel,
    signals: signalsPanel
  };

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signal_row_label}>
        <MetricCard
          label={copy.metrics.pipeline_status}
          value={copy.pipeline[state].label}
          valueClassName={pipelineValueTone(state)}
          hint={pipelineStateDetail(copy, state, resultMessage)}
        />
        <MetricCard
          label={copy.metrics.signal_count}
          value={`${result.signals.length}`}
          hint={fill(copy.metrics.signal_count_hint, {
            positive: String(positiveCount),
            negative: String(negativeCount),
            neutral: String(neutralCount)
          })}
        />
        <MetricCard label={copy.metrics.latest_signal} value={latestSignalValue} hint={latestSignalHint} />
        <MetricCard
          label={copy.metrics.usage_boundary}
          value={AI_RESEARCH_ENABLED ? copy.metrics.boundary_enabled : copy.metrics.boundary_disabled}
          hint={copy.metrics.boundary_hint}
        />
      </SignalRow>

      {copy.panel_order.map((id) => {
        if (!isPanelId(id)) {
          throw new Error(`Unknown research panel: ${id}`);
        }
        return <Fragment key={id}>{panels[id]}</Fragment>;
      })}

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'research-signals',
            label: state === 'error' ? copy.footer.source_signals_error : copy.footer.source_signals_ok,
            asOf,
            basis: 'derived'
          },
          {
            id: 'research-pipeline-config',
            label: copy.footer.source_pipeline,
            basis: 'assumption'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.footer.method_label}
        limitations={copy.footer.limitations}
      />
    </PageTemplate>
  );
}
