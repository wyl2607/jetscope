import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { TransitionLadder } from '@/components/transition-ladder';
import { messagesFor, type HomeMessages, type Locale } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import {
  AI_RESEARCH_ENABLED,
  buildResearchDecisionBrief,
  getResearchSignals
} from '@/lib/research-signals-read-model';
import { type TransitionSummaryResponse, loadTransitionSummary } from '@/lib/transition-read-model';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One home view for three real routes. Copy comes from `src/locales/*.json`.
 * The thin `app/page`, `app/de/page` and `app/en/page` files pass the locale
 * they already own; they do not rewrite the public URL.
 *
 * Locale differences stay as data. zh keeps the transition ladder, research
 * brief, dual-domain narrative and zh-only entry cards. de/en stay slimmer
 * indexes. A null `NAV_ENTRIES` path omits the card instead of throwing.
 */

function isoDaysAgo(days: number): string { // figure-contract-lint-ignore: query window, not a displayed as-of
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
  );
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function stressTone(level?: string): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'elevated') return 'text-warning';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function eventTone(type?: string): string {
  if (type === 'CRITICAL') return 'text-danger';
  if (type === 'ALERT') return 'text-warning';
  if (type === 'CROSSOVER') return 'text-success';
  return 'text-warning';
}

function researchTone(status: string): string {
  if (status === 'error') return 'text-danger';
  if (status === 'not_found') return 'text-warning';
  return 'text-accent';
}

function reserveBasis(sourceType?: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

function formatCoverage(weeks: number, unit: string): string { // figure-contract-lint-ignore: internal formatter parameter, not a measurement prop
  return `${weeks.toFixed(2)} ${unit}`;
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function hrefFor(locale: Locale, navId: string, suffix = ''): Route | null {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) return null;
  return `${path}${suffix}` as Route;
}

function thesisHref(locale: Locale, kind: string, copy: HomeMessages): Route | null {
  if (kind === 'primary') return hrefFor(locale, 'dashboard');
  if (kind === 'scenario') return hrefFor(locale, 'scenarios');
  if (kind === 'sources') return hrefFor(locale, 'sources');
  if (kind === 'chinese_workspace' && copy.chinese_workspace_href) {
    return copy.chinese_workspace_href as Route;
  }
  return null;
}

function thesisLabel(kind: string, copy: HomeMessages): string {
  if (kind === 'primary') return copy.primary_cta;
  if (kind === 'scenario') return copy.scenario_cta;
  if (kind === 'sources') return copy.sources_cta;
  if (kind === 'chinese_workspace') return copy.chinese_workspace_cta;
  return kind;
}

export async function HomePage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).home;
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);
  const latestEvent = events[0] ?? null;
  const latestResearchSignal = signalsResult.signals.reduce<typeof signalsResult.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    const signalTime = signal.published_at == null ? Number.NEGATIVE_INFINITY : Date.parse(signal.published_at);
    const latestTime = latest.published_at == null ? Number.NEGATIVE_INFINITY : Date.parse(latest.published_at);
    return signalTime > latestTime ? signal : latest;
  }, null);
  const signalCount = signalsResult.signals.length;
  const researchBrief = copy.show_research_brief ? buildResearchDecisionBrief(signalsResult) : null;
  const asOf = latestTimestamp([reserve?.generated_at, latestEvent?.observed_at, latestResearchSignal?.published_at]);

  let transition: TransitionSummaryResponse | null = null;
  let transitionError = false;
  if (copy.show_transition_ladder) {
    try {
      transition = await loadTransitionSummary();
    } catch {
      transitionError = true;
    }
  }

  const recommendedHref = hrefFor(locale, 'dashboard');
  const sourcesHref = hrefFor(locale, 'sources');
  const researchHref = hrefFor(locale, 'research');
  const eventsHref = hrefFor(locale, copy.sources.events_nav_id, copy.sources.events_suffix);
  const gridHref = hrefFor(locale, 'grid');
  const safHref = hrefFor(locale, 'crisis', '/saf-tipping-point');
  const entryCards = copy.entry_cards.flatMap((card) => {
    const href = hrefFor(locale, card.navId, card.suffix);
    return href ? [{ ...card, href }] : [];
  });
  const thesisCtas = copy.thesis_ctas.flatMap((kind) => {
    const href = thesisHref(locale, kind, copy);
    const label = thesisLabel(kind, copy);
    return href && label ? [{ kind, href, label }] : [];
  });
  const researchValue =
    signalsResult.status === 'not_found'
      ? copy.signals.research_not_found
      : signalsResult.status === 'error'
        ? copy.signals.research_error
        : interpolate(copy.signals.research_count, { count: String(signalCount) });
  const reserveValue = reserve
    ? formatCoverage(reserve.coverage_weeks, copy.signals.reserve_unit)
    : copy.signals.reserve_unavailable;
  const reserveHint = reserve
    ? interpolate(copy.signals.reserve_hint, { stress_level: reserve.stress_level })
    : copy.signals.reserve_hint_unavailable;
  const eventHint = latestEvent
    ? interpolate(copy.signals.event_hint, {
        pathway: latestEvent.saf_pathway.toUpperCase(),
        count: String(events.length)
      })
    : interpolate(copy.signals.event_hint_empty, { count: String(events.length) });
  const limitations = [
    ...copy.limitations,
    copy.swap_research_limitation && !AI_RESEARCH_ENABLED
      ? copy.limitation_research_disabled
      : copy.limitation_research_enabled
  ];
  const isPortfolio = copy.entry_layout === 'portfolio';

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.page_title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signals.label}>
        <MetricCard
          label={copy.signals.recommended_label}
          value={copy.signals.recommended_value}
          hint={copy.signals.recommended_hint}
          cardHref={recommendedHref ?? undefined}
        />
        <MetricCard
          label={copy.signals.reserve_label}
          value={reserveValue}
          valueClassName={stressTone(reserve?.stress_level)}
          hint={reserveHint}
        />
        <MetricCard
          label={copy.signals.event_label}
          value={latestEvent?.event_type ?? copy.signals.event_empty}
          valueClassName={eventTone(latestEvent?.event_type)}
          hint={eventHint}
        />
        <MetricCard
          label={copy.signals.research_label}
          value={researchValue}
          valueClassName={researchTone(signalsResult.status)}
          hint={copy.signals.research_hint}
        />
      </SignalRow>

      {copy.show_thesis ? (
        <Panel locale={locale} title={copy.thesis.title} why={copy.thesis.why}>
          <div className="space-y-4">
            <p className="text-2xl font-semibold leading-tight text-ink md:text-4xl">{copy.thesis.headline}</p>
            <p className="max-w-3xl text-base leading-7 text-muted md:text-lg">{copy.thesis.body}</p>
            {thesisCtas.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {thesisCtas.map((cta) => (
                  <Link
                    key={cta.kind}
                    href={cta.href}
                    className={
                      cta.kind === 'primary'
                        ? 'rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface transition hover:bg-ink'
                        : 'rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft'
                    }
                  >
                    {cta.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {copy.show_dual_domain ? (
        <Panel locale={locale} title={copy.dual_domain.title} why={copy.dual_domain.why}>
          <div className="space-y-4">
            <p className="text-base leading-7 text-ink">{copy.dual_domain.body}</p>
            <div className="flex flex-wrap gap-4">
              {gridHref ? (
                <Link
                  href={gridHref}
                  className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft"
                >
                  {copy.dual_domain.grid_cta}
                </Link>
              ) : null}
              {safHref ? (
                <Link
                  href={safHref}
                  className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft"
                >
                  {copy.dual_domain.saf_cta}
                </Link>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      {copy.show_transition_ladder ? (
        <Panel
          locale={locale}
          title={copy.transition.title}
          why={copy.transition.why}
          state={transitionError ? 'error' : transition ? 'ready' : 'empty'}
          stateDetail={transitionError ? copy.transition.error_detail : copy.transition.empty_detail}
        >
          {transition ? <TransitionLadder summary={transition} /> : null}
        </Panel>
      ) : null}

      {copy.show_research_brief && researchBrief ? (
        <Panel locale={locale} title={copy.research_brief.title} why={copy.research_brief.why}>
          <ResearchDecisionBriefCard brief={researchBrief} compact />
        </Panel>
      ) : null}

      <Panel locale={locale} title={copy.entries.title} why={copy.entries.why}>
        <div className={isPortfolio ? 'grid gap-6 md:grid-cols-2 xl:grid-cols-5' : 'grid gap-6 lg:grid-cols-3'}>
          {entryCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {isPortfolio ? copy.entries.eyebrow_label : card.href}
              </p>
              <h3 className={isPortfolio ? 'mt-2 text-xl font-semibold text-ink' : 'mt-2 text-lg font-medium text-ink'}>
                {card.title}
              </h3>
              <p className={isPortfolio ? 'mt-3 text-sm leading-6 text-muted' : 'mt-3 text-sm leading-7 text-muted'}>
                {card.description}
              </p>
              {copy.entries.open_label ? (
                <p className="mt-4 text-sm font-medium text-accent">{copy.entries.open_label}</p>
              ) : null}
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'reserve-signal',
            label: interpolate(copy.sources.reserve_label, {
              source_name: reserve?.source_name ?? copy.sources.reserve_unavailable
            }),
            href: sourcesHref ?? undefined,
            asOf: reserve?.generated_at ?? null,
            basis: reserveBasis(reserve?.source_type)
          },
          {
            id: 'tipping-events',
            label: interpolate(copy.sources.events_label, { count: String(events.length) }),
            href: eventsHref ?? undefined,
            asOf: latestEvent?.observed_at ?? null,
            basis: 'observed'
          },
          {
            id: 'research-signals',
            label: interpolate(copy.sources.research_label, { count: String(signalCount) }),
            href: researchHref ?? undefined,
            asOf: latestResearchSignal?.published_at ?? null,
            basis: 'derived'
          }
        ]}
        methodHref={sourcesHref ?? undefined}
        methodLabel={copy.sources.method_label}
        limitations={limitations}
      />
    </PageTemplate>
  );
}
