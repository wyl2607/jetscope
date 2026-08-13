import { MetricCard } from '@/components/cards';
import { formatAsOf, PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ScenarioRegistry } from '@/components/scenario-registry';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { TransitionReadinessDashboard } from '@/components/transition-readiness-dashboard';
import { buildApiUrl } from '@/lib/api-config';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { derived, type Figure } from '@/lib/figure';
import { messagesFor, type Locale, type ScenariosMessages } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import type { AirlineDecisionResponse, TippingPointResponse } from '@/lib/product-read-model';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One scenarios view for three real routes. Copy comes from `src/locales/*.json`.
 * The thin `app/scenarios`, `app/de/scenarios` and `app/en/scenarios` pages pass
 * the locale they already own; they do not rewrite the public URL.
 *
 * Flags were verified against the current locale pages: only zh mounts the
 * write registry and the transition-readiness dashboard. de/en stay read-only.
 */
export const SCENARIO_SURFACE = {
  zh: { show_scenario_registry: true, show_transition_readiness: true },
  de: { show_scenario_registry: false, show_transition_readiness: false },
  en: { show_scenario_registry: false, show_transition_readiness: false }
} as const;

const REVIEW_ACTIONS = [
  { id: 'primary_editor', navId: 'scenarios', hrefLocale: 'zh' as const, query: '' },
  { id: 'sources', navId: 'sources', hrefLocale: null, query: '?filter=review' },
  { id: 'dashboard', navId: 'dashboard', hrefLocale: null, query: '' },
  { id: 'admin', navId: 'admin', hrefLocale: null, query: '' }
] as const;

const POLICY_TARGETS_SOURCE_ID = 'policy-targets';
const CJK_CHAR = /[\u4e00-\u9fff]/;

type PolicyTargetWire = {
  year: number; // figure-contract-lint-ignore: calendar year on the wire, not a display measurement
  saf_share_pct: number; // figure-contract-lint-ignore: wire payload, converted to Figure before render
  synthetic_share_pct: number; // figure-contract-lint-ignore: wire payload, converted to Figure before render
  label: string;
};

type PolicyTarget = {
  year: number; // figure-contract-lint-ignore: calendar year, not a measurement
  saf_share_pct: Figure;
  synthetic_share_pct: Figure;
  label: string;
};

type Surface = (typeof SCENARIO_SURFACE)[Locale];

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => vars[key] ?? '');
}

function hrefFor(locale: Locale, navId: string, query = ''): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Scenarios has no ${locale} path for ${navId}`);
  }
  return `${path}${query}` as Route;
}

function actionHref(locale: Locale, actionId: string): Route {
  const action = REVIEW_ACTIONS.find((item) => item.id === actionId);
  if (!action) {
    throw new Error(`Scenarios has no review action ${actionId}`);
  }
  return hrefFor(action.hrefLocale ?? locale, action.navId, action.query);
}

/**
 * Substitute a saved name when its script does not match the reader locale.
 * CJK stays on zh; Latin stays on de/en. This is the reports rule applied here.
 */
export function scenarioNameForLocale(
  name: string,
  index: number, // figure-contract-lint-ignore: list position, not a measurement
  locale: Locale,
  placeholder: string
): string {
  const hasCjk = CJK_CHAR.test(name);
  const matchesReader = locale === 'zh' ? hasCjk : !hasCjk;
  if (matchesReader) return name;
  return fill(placeholder, { index: String(index + 1) });
}

function formatNumber(
  value: number, // figure-contract-lint-ignore: formatter input, not a display prop
  locale: Locale,
  digits = 2
): string {
  const tag = locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-US';
  return Number(value).toLocaleString(tag, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

/**
 * RefuelEU blend targets are statutory mandates, not scenario assumptions.
 * API has no source timestamp → derived + method; never assumed().
 */
function toPolicyTargetFigures(row: PolicyTargetWire): PolicyTarget {
  const shareFigure = (
    value: number, // figure-contract-lint-ignore: wire payload, converted to Figure before render
    which: string
  ): Figure =>
    derived({
      value,
      unit: '%',
      sourceId: POLICY_TARGETS_SOURCE_ID,
      asOf: null,
      precision: 1,
      method: `RefuelEU mandatory ${which} blending target (statutory mandate, not a scenario assumption)`
    });
  return {
    year: row.year,
    saf_share_pct: shareFigure(row.saf_share_pct, 'SAF'),
    synthetic_share_pct: shareFigure(row.synthetic_share_pct, 'synthetic aviation fuel'),
    label: row.label
  };
}

/**
 * Demo constants only. `generated_at: null` forces downstream
 * `toPathwayCostRow(..., { basis: 'assumption' })` so these never render as
 * observed measurements (UI_CONTRACT.md §3 rule 2).
 */
function defaultTippingPointResponse(): TippingPointResponse {
  return {
    generated_at: null,
    effective_fossil_jet_usd_per_l: 1.3,
    signal: 'fossil_still_advantaged',
    inputs: {
      fossil_jet_usd_per_l: 1.3,
      carbon_price_eur_per_t: 95,
      subsidy_usd_per_l: 0,
      blend_rate_pct: 6
    },
    pathways: [
      {
        pathway_key: 'hefa',
        display_name: 'HEFA',
        net_cost_low_usd_per_l: 1,
        net_cost_high_usd_per_l: 1.5,
        spread_low_pct: 0,
        spread_high_pct: 15,
        status: 'inflection'
      }
    ]
  };
}

function defaultAirlineDecisionResponse(): AirlineDecisionResponse {
  return {
    generated_at: null,
    inputs: {
      fossil_jet_usd_per_l: 1.3,
      reserve_weeks: 3,
      carbon_price_eur_per_t: 95,
      pathway_key: 'hefa'
    },
    signal: 'incremental_adjustment',
    probabilities: {
      raise_fares: 0.45,
      cut_capacity: 0.3,
      buy_spot_saf: 0.2,
      sign_long_term_offtake: 0.25,
      ground_routes: 0.08
    }
  };
}

async function getPolicyTargets(): Promise<PolicyTarget[]> {
  try {
    const response = await fetch(buildApiUrl('/policies/refuel-eu'), { cache: 'no-store' });
    if (!response.ok) return [];
    const rows = (await response.json()) as PolicyTargetWire[];
    return rows.map(toPolicyTargetFigures);
  } catch {
    return [];
  }
}

function tippingPointLabel(signal: string, copy: ScenariosMessages['transition_signal']): { label: string; tone: string } {
  if (signal === 'saf_cost_advantaged') return { label: copy.saf_advantaged, tone: 'text-success' };
  if (signal === 'switch_window_opening') return { label: copy.switch_window, tone: 'text-warning' };
  return { label: copy.fossil_advantaged, tone: 'text-danger' };
}

function airlineDecisionLabel(signal: string, copy: ScenariosMessages['airline_signal']): string {
  if (signal === 'switch_window_opening') return copy.switch_window;
  if (signal === 'capacity_stress_dominant') return copy.capacity_stress;
  return copy.incremental;
}

function reserveBasis(sourceType: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

function sourceStatusLabel(status: string, copy: ScenariosMessages['source_status']): string {
  if (status === 'ok') return copy.ok;
  if (status === 'degraded') return copy.degraded;
  if (status === 'offline') return copy.offline;
  if (status === 'unknown') return copy.unknown;
  return status;
}

function riskLevelLabel(level: string, copy: ScenariosMessages['risk_signal']): string {
  if (level === 'normal') return copy.level_normal;
  if (level === 'watch') return copy.level_watch;
  if (level === 'alert') return copy.level_alert;
  return level;
}

function riskTone(level: string | undefined): string {
  if (level === 'alert') return 'text-danger';
  if (level === 'watch') return 'text-warning';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function WorkspaceSignals({
  copy,
  readModel,
  tippingPoint,
  airlineDecision,
  usingDefaultTippingPoint,
  usingDefaultDecision
}: {
  copy: ScenariosMessages;
  readModel: Awaited<ReturnType<typeof getDashboardReadModel>>;
  tippingPoint: TippingPointResponse;
  airlineDecision: AirlineDecisionResponse;
  usingDefaultTippingPoint: boolean;
  usingDefaultDecision: boolean;
}) {
  const reserve = readModel.reserve;
  const tippingSignal = usingDefaultTippingPoint
    ? { label: copy.transition_signal.needs_review, tone: 'text-warning' }
    : tippingPointLabel(tippingPoint.signal, copy.transition_signal);
  const fallbackCount = Number(usingDefaultTippingPoint) + Number(usingDefaultDecision) + Number(reserve == null);
  const dataPosture =
    fallbackCount === 0 ? copy.data_posture.connected : fallbackCount === 3 ? copy.data_posture.assumed : copy.data_posture.partial;
  const dataTone = fallbackCount === 0 ? 'text-success' : fallbackCount === 3 ? 'text-danger' : 'text-warning';
  const reserveLabel = reserve
    ? fill(copy.reserve.weeks, { weeks: reserve.coverage_weeks.toFixed(1) })
    : copy.reserve.needs_review;
  const reserveTone =
    reserve == null
      ? 'text-warning'
      : reserve.coverage_weeks <= 2
        ? 'text-danger'
        : reserve.coverage_weeks <= 4
          ? 'text-warning'
          : 'text-success';

  return (
    <SignalRow label={copy.signal_row_label}>
      <MetricCard
        label={copy.transition_signal.label}
        value={tippingSignal.label}
        valueClassName={tippingSignal.tone}
        hint={usingDefaultTippingPoint ? copy.transition_signal.hint_fallback : copy.transition_signal.hint}
      />
      <MetricCard
        label={copy.data_posture.label}
        value={dataPosture}
        valueClassName={dataTone}
        hint={
          readModel.isFallback
            ? copy.data_posture.hint_fallback
            : fill(copy.data_posture.hint, { count: String(fallbackCount) })
        }
      />
      <MetricCard
        label={copy.airline_signal.label}
        value={usingDefaultDecision ? copy.airline_signal.needs_review : airlineDecisionLabel(airlineDecision.signal, copy.airline_signal)}
        valueClassName={usingDefaultDecision ? 'text-warning' : 'text-accent'}
        hint={copy.airline_signal.hint}
      />
      <MetricCard
        label={copy.reserve.label}
        value={reserveLabel}
        valueClassName={reserveTone}
        hint={
          reserve
            ? fill(copy.reserve.hint, {
                source: reserve.source_name,
                confidence: (reserve.confidence_score * 100).toFixed(0)
              })
            : copy.reserve.hint_fallback
        }
      />
    </SignalRow>
  );
}

function ReviewSignals({
  copy,
  locale,
  readModel
}: {
  copy: ScenariosMessages;
  locale: Locale;
  readModel: Awaited<ReturnType<typeof getDashboardReadModel>>;
}) {
  const market = readModel.market.values;
  const sourceStatus = readModel.market.source_status;
  const risk = readModel.topRiskSignal;
  const needsReview =
    readModel.isFallback ||
    sourceStatus.overall !== 'ok' ||
    risk == null ||
    risk.level !== 'normal' ||
    readModel.scenarioCount === 0;
  const assumptionPosture = readModel.isFallback
    ? copy.assumption_posture.unreliable
    : sourceStatus.overall === 'offline' || risk?.level === 'alert'
      ? copy.assumption_posture.reassess
      : needsReview
        ? copy.assumption_posture.review
        : copy.assumption_posture.usable;
  const assumptionTone =
    readModel.isFallback || sourceStatus.overall === 'offline' || risk?.level === 'alert'
      ? 'text-danger'
      : needsReview
        ? 'text-warning'
        : 'text-success';
  const riskValue =
    risk == null
      ? copy.risk_signal.none
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskAsOf = formatAsOf(risk?.latestAsOf ?? null, locale) ?? copy.not_available;
  const riskHint =
    risk == null
      ? copy.risk_signal.none_hint
      : fill(copy.risk_signal.hint, {
          level: riskLevelLabel(risk.level, copy.risk_signal),
          samples: String(risk.sampleCount),
          asOf: riskAsOf
        });

  return (
    <SignalRow label={copy.signal_row_label}>
      <MetricCard
        label={copy.assumption_posture.label}
        value={assumptionPosture}
        valueClassName={assumptionTone}
        hint={
          readModel.isFallback
            ? copy.assumption_posture.hint_fallback
            : needsReview
              ? copy.assumption_posture.hint_review
              : copy.assumption_posture.hint_ok
        }
      />
      <MetricCard
        label={copy.saved_scenarios.label}
        value={`${readModel.scenarioCount}`}
        hint={readModel.scenarioCount > 0 ? copy.saved_scenarios.hint : copy.saved_scenarios.hint_empty}
      />
      <MetricCard
        label={copy.market_context.label}
        value={fill(copy.market_context.value, {
          brent: formatNumber(market.brent_usd_per_bbl, locale)
        })}
        hint={fill(copy.market_context.hint, {
          jet: formatNumber(market.jet_usd_per_l, locale, 3),
          eu: formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, locale, 3),
          carbon: formatNumber(market.carbon_proxy_usd_per_t, locale)
        })}
      />
      <MetricCard label={copy.risk_signal.label} value={riskValue} hint={riskHint} valueClassName={riskTone(risk?.level)} />
    </SignalRow>
  );
}

function WorkspacePanels({
  copy,
  locale,
  surface,
  reserve,
  tippingPoint,
  airlineDecision,
  policyTargets
}: {
  copy: ScenariosMessages;
  locale: Locale;
  surface: Surface;
  reserve: Awaited<ReturnType<typeof getDashboardReadModel>>['reserve'];
  tippingPoint: TippingPointResponse;
  airlineDecision: AirlineDecisionResponse;
  policyTargets: PolicyTarget[];
}) {
  return (
    <>
      {surface.show_transition_readiness ? (
        <Panel locale={locale} title={copy.readiness_panel.title} why={copy.readiness_panel.why}>
          <TransitionReadinessDashboard
            initialReserve={reserve}
            initialTippingPoint={tippingPoint}
            initialDecision={airlineDecision}
            policyTargets={policyTargets}
          />
        </Panel>
      ) : null}

      {surface.show_scenario_registry ? (
        <Panel locale={locale} title={copy.registry_panel.title} why={copy.registry_panel.why}>
          <ScenarioRegistry />
        </Panel>
      ) : null}

      <Panel locale={locale} title={copy.capabilities_panel.title} why={copy.capabilities_panel.why}>
        <ul className="grid gap-6 md:grid-cols-3 text-sm leading-7 text-muted">
          {copy.capabilities.map((card) => (
            <li key={card.title}>
              <h3 className="text-lg font-medium text-ink">{card.title}</h3>
              <p className="mt-2">{card.body}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel locale={locale} title={copy.duties_panel.title} why={copy.duties_panel.why}>
        <div className="space-y-3 text-sm leading-7 text-muted">
          {copy.duties.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Panel>
    </>
  );
}

function ReviewPanels({
  copy,
  locale,
  readModel
}: {
  copy: ScenariosMessages;
  locale: Locale;
  readModel: Awaited<ReturnType<typeof getDashboardReadModel>>;
}) {
  const deliveryHint = readModel.isFallback
    ? fill(copy.delivery_fallback, { error: readModel.error ?? copy.unknown_cause })
    : fill(copy.delivery_live, {
        status: sourceStatusLabel(readModel.market.source_status.overall, copy.source_status),
        minutes: String(readModel.freshnessSignal.minutes)
      });

  return (
    <>
      <Panel locale={locale} title={copy.assumptions_panel.title} why={copy.assumptions_panel.why}>
        {readModel.recentScenarioNames.length ? (
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {readModel.recentScenarioNames.map((name, index) => (
              <li key={`${name}-${index}`}>
                {scenarioNameForLocale(name, index, locale, copy.scenario_name_placeholder)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-warning bg-warning-soft p-4 text-sm leading-7 text-warning">
            {copy.assumptions_panel.empty}
          </p>
        )}
      </Panel>

      <Panel locale={locale} title={copy.context_panel.title} why={copy.context_panel.why}>
        <div className="space-y-3 text-sm leading-7 text-muted">
          <p>{deliveryHint}</p>
          {copy.context_paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Panel>

      <Panel locale={locale} title={copy.review_panel.title} why={copy.review_panel.why}>
        <p className="mb-4 text-sm leading-7 text-muted">
          <span className="font-medium text-ink">{copy.write_boundary_label}:</span> {copy.write_boundary_body}
        </p>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {copy.actions.map((action) => (
            <Link
              key={action.id}
              href={actionHref(locale, action.id)}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-semibold text-ink">{action.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </>
  );
}

export async function ScenariosPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).scenarios;
  const surface = SCENARIO_SURFACE[locale];
  const isWorkspace = surface.show_scenario_registry || surface.show_transition_readiness;
  const [readModel, policyTargets] = await Promise.all([
    getDashboardReadModel(locale),
    surface.show_transition_readiness ? getPolicyTargets() : Promise.resolve([] as PolicyTarget[])
  ]);
  const usingDefaultTippingPoint = readModel.tippingPoint == null;
  const usingDefaultDecision = readModel.airlineDecision == null;
  const tippingPoint = readModel.tippingPoint ?? defaultTippingPointResponse();
  const airlineDecision = readModel.airlineDecision ?? defaultAirlineDecisionResponse();
  const reserve = readModel.reserve;
  const asOf = surface.show_transition_readiness
    ? usingDefaultTippingPoint
      ? null
      : tippingPoint.generated_at
    : readModel.isFallback
      ? null
      : readModel.market.generated_at;

  const workspaceSources: SourceRef[] = [
    {
      id: 'dashboard-read-model',
      label: readModel.isFallback
        ? fill(copy.source_dashboard_fallback, { error: readModel.error ?? copy.unknown_cause })
        : copy.source_dashboard_live,
      asOf: readModel.isFallback ? null : readModel.market.generated_at,
      basis: readModel.isFallback ? 'assumption' : 'observed'
    },
    {
      id: 'tipping-point-analysis',
      label: usingDefaultTippingPoint ? copy.source_tipping_fallback : copy.source_tipping_live,
      asOf: usingDefaultTippingPoint ? null : tippingPoint.generated_at,
      basis: usingDefaultTippingPoint ? 'assumption' : 'derived'
    },
    {
      id: 'airline-decision-analysis',
      label: usingDefaultDecision ? copy.source_airline_fallback : copy.source_airline_live,
      asOf: usingDefaultDecision ? null : airlineDecision.generated_at,
      basis: usingDefaultDecision ? 'assumption' : 'derived'
    },
    {
      id: 'reserve-signal',
      label: reserve ? fill(copy.source_reserve_live, { source: reserve.source_name }) : copy.source_reserve_fallback,
      asOf: reserve?.generated_at ?? null,
      basis: reserve ? reserveBasis(reserve.source_type) : 'assumption'
    },
    {
      id: 'scenario-store',
      label: copy.source_store,
      basis: 'assumption'
    },
    {
      id: 'policy-targets',
      label: policyTargets.length ? copy.source_policy_live : copy.source_policy_empty,
      basis: 'derived'
    }
  ];

  const reviewSources: SourceRef[] = [
    {
      id: 'dashboard-read-model',
      label: readModel.isFallback ? copy.source_dashboard_fallback : copy.source_dashboard_live,
      asOf: readModel.isFallback ? null : readModel.market.generated_at,
      basis: readModel.isFallback ? 'assumption' : 'observed'
    },
    {
      id: 'scenario-store',
      label: fill(copy.source_store_count, { count: String(readModel.scenarioCount) }),
      basis: 'assumption'
    },
    {
      id: 'risk-signal',
      label: copy.source_risk,
      basis: 'derived'
    }
  ];

  return (
    <PageTemplate locale={locale} eyebrow={copy.eyebrow} title={copy.title} question={copy.question} asOf={asOf}>
      {isWorkspace ? (
        <WorkspaceSignals
          copy={copy}
          readModel={readModel}
          tippingPoint={tippingPoint}
          airlineDecision={airlineDecision}
          usingDefaultTippingPoint={usingDefaultTippingPoint}
          usingDefaultDecision={usingDefaultDecision}
        />
      ) : (
        <ReviewSignals copy={copy} locale={locale} readModel={readModel} />
      )}

      {isWorkspace ? (
        <WorkspacePanels
          copy={copy}
          locale={locale}
          surface={surface}
          reserve={reserve}
          tippingPoint={tippingPoint}
          airlineDecision={airlineDecision}
          policyTargets={policyTargets}
        />
      ) : (
        <ReviewPanels copy={copy} locale={locale} readModel={readModel} />
      )}

      <SourceFooter
        locale={locale}
        sources={isWorkspace ? workspaceSources : reviewSources}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
