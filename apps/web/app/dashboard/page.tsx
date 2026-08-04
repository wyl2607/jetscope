import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { computeDashboardAlertBanners } from '@/lib/market-signals';
import { getDashboardReadModel, getPriceTrendChartReadModel, type DashboardReadModel } from '@/lib/product-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const priorities = [
  'Real-time market data: Brent crude, jet fuel proxy, EU ETS carbon',
  'Unified scenario engine: price, subsidy, carbon cost, break-even analysis',
  'Admin control: route assumptions, policy parameters, data provenance',
  'Export & reporting: charts, snapshots, scenario comparison'
];


export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dashboard',
  description:
    'Live SAF versus fossil jet fuel dashboard with market snapshot, scenario registry status, and transition delivery signals.',
  path: '/dashboard'
});

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatAsOf(value: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

export default async function DashboardPage() {
  const readModel = await getDashboardReadModel();
  const priceChartData = await getPriceTrendChartReadModel();
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;
  const derived = readModel.market.derived ?? {};
  const event = readModel.aviationEvent;
  const decision = readModel.airlineDecision;
  const analysis = readModel.analysisInputs;

  const riskColor =
    risk?.level === 'alert' ? 'text-rose-300' : risk?.level === 'watch' ? 'text-amber-300' : 'text-emerald-300';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? 'No history signal available yet'
      : `level=${risk.level} | as_of=${formatAsOf(risk.latestAsOf)} | samples=${risk.sampleCount}`;

  const alertBanners = computeDashboardAlertBanners(readModel.market, risk);
  const spread =
    typeof derived.jet_vs_brent_spread_usd_per_l === 'number' ? derived.jet_vs_brent_spread_usd_per_l : null;
  const multiplier =
    typeof derived.jet_vs_brent_multiplier === 'number' ? derived.jet_vs_brent_multiplier : null;
  const facts = (event?.verified_facts ?? {}) as Record<string, unknown>;
  const coverageMetrics = readModel.sourceCoverage?.metrics?.length ?? 0;
  const coverageCompleteness = readModel.sourceCoverage?.completeness;

  const health = readModel.marketHealth;
  const formatEta = (seconds: number | null | undefined) => {
    if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  return (
    <Shell
      eyebrow="Market Intelligence"
      title="SAF vs Oil Decision Cockpit"
      description="Live market snapshot, scenario modelling, and transition risk signals for sustainable aviation fuel decisions."
    >
      <section
        className={`mb-6 rounded-xl border p-4 ${
          health?.healthy === false
            ? 'border-rose-800/60 bg-rose-950/20'
            : 'border-emerald-800/50 bg-emerald-950/20'
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Live market strip</p>
            <p className="mt-1 text-sm text-slate-200">
              Snapshot as_of <strong className="text-white">{formatAsOf(readModel.market.generated_at)}</strong>
              {' · '}
              freshness <strong className="text-white">{freshness.level}</strong> ({freshness.minutes}m)
              {' · '}
              overall <code className="text-sky-300">{readModel.market.source_status.overall}</code>
              {spread != null && (
                <>
                  {' · '}
                  Jet–Brent spread <strong className="text-white">${formatNumber(spread, 3)}/L</strong>
                  {multiplier != null ? ` (×${formatNumber(multiplier, 3)})` : ''}
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Analysis jet: {analysis.jetSourceKey}=${formatNumber(analysis.fossilJetUsdPerL, 3)}/L · ETS €
              {formatNumber(analysis.carbonPriceEurPerT)}/t · refresh interval{' '}
              {health?.refresh_interval_seconds ?? '—'}s · next ETA {formatEta(health?.next_refresh_eta_seconds)} ·
              health {health == null ? 'n/a' : health.healthy ? 'ok' : 'attention'}
              {health?.runs_total != null
                ? ` · runs ${health.runs_ok}/${health.runs_total}`
                : ''}
            </p>
            {health?.note ? <p className="mt-1 text-xs text-slate-500">{health.note}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href="/sources"
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
            >
              Trust center →
            </a>
            <a
              href="/crisis/saf-tipping-point"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-400"
            >
              Tipping point
            </a>
          </div>
        </div>
      </section>

      {event && (
        <section className="mb-6 rounded-xl border border-sky-800/60 bg-sky-950/30 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                Aviation event · curated only · as_of {event.as_of ?? 'n/a'}
              </p>
              <h2 className="mt-1 text-base font-semibold text-white">
                {event.entity?.name ?? 'Lufthansa'} — {event.source?.title ?? event.id}
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Q2 adj. profit €{String(facts.q2_adjusted_operating_profit_eur_m ?? '—')}m (
                {String(facts.q2_adjusted_operating_profit_yoy_change_pct ?? '—')}%) · extra kerosene €
                {String(facts.q2_extra_kerosene_cost_iran_war_eur_m ?? '—')}m · strikes ~€
                {String(facts.q2_strike_cost_eur_m_approx ?? '—')}m · fare pass-through ~
                {String(facts.kerosene_cost_pass_through_pct_approx ?? '—')}% · FY fuel bill €
                {String(facts.fy_fuel_cost_expected_eur_bn ?? '—')}bn · FY guidance €
                {String(
                  (facts.fy_guidance_adjusted_operating_profit_eur_bn as { low?: number; high?: number } | undefined)
                    ?.low ?? '—'
                )}
                –
                {String(
                  (facts.fy_guidance_adjusted_operating_profit_eur_bn as { low?: number; high?: number } | undefined)
                    ?.high ?? '—'
                )}
                bn
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Jet for analysis uses live snapshot ({analysis.jetSourceKey}=${formatNumber(analysis.fossilJetUsdPerL, 3)}
                /L) — not an invented LH-reported jet USD/L. Residual exposure shown when pass-through is applied.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <a
                href="/crisis/saf-tipping-point?lh=1"
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-sky-500"
              >
                Open LH playbook →
              </a>
              <a
                href="/de/lufthansa-saf-2026"
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-center text-xs font-medium text-slate-200 hover:border-slate-400"
              >
                DE analysis
              </a>
            </div>
          </div>
          {decision?.residual_fuel_cost_exposure != null && (
            <p className="mt-3 text-sm text-amber-200">
              Residual fuel-cost exposure (model index): {formatNumber(decision.residual_fuel_cost_exposure, 3)} ·
              pass-through {decision.fare_pass_through_pct != null ? `${Math.round(decision.fare_pass_through_pct * 100)}%` : 'n/a'} ·
              labor €{decision.labor_cost_impact_eur_m ?? '—'}m · extra fuel €{decision.extra_fuel_cost_eur_m ?? '—'}m
            </p>
          )}
        </section>
      )}

      {alertBanners.length > 0 && (
        <section className="mb-6 space-y-3">
          {alertBanners.map((banner, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-4 ${
                banner.level === 'alert'
                  ? 'border-rose-800 bg-rose-950/40'
                  : 'border-amber-800 bg-amber-950/40'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      banner.level === 'alert' ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    {banner.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{banner.message}</p>
                </div>
                {banner.href && (
                  <a
                    href={banner.href}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      banner.level === 'alert'
                        ? 'bg-rose-600 text-white hover:bg-rose-500'
                        : 'bg-amber-600 text-white hover:bg-amber-500'
                    }`}
                  >
                    View details →
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Market snapshot"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet(global) $${formatNumber(market.jet_usd_per_l, 3)}/L | Jet(EU proxy) $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | Carbon $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
        <MetricCard
          label="Jet–Brent derived"
          value={
            spread == null
              ? 'n/a'
              : `$${formatNumber(spread, 3)}/L`
          }
          hint={
            multiplier == null
              ? 'Arithmetic from snapshot only when Brent + jet present'
              : `×${formatNumber(multiplier, 3)} vs Brent/L · source ${String(derived.jet_source ?? analysis.jetSourceKey)} · not a forecast`
          }
        />
        <MetricCard
          label="Scenario mode"
          value={`${readModel.scenarioCount}`}
          hint="从 /v1/workspaces/{slug}/scenarios 读取"
        />
        <MetricCard label="Admin control" value="Required" hint="路线成本、政策参数、来源维护" />
        <MetricCard
          label="Delivery lane"
          value={readModel.isFallback ? 'Fallback' : 'Live Slice'}
          hint={
            readModel.isFallback
              ? `API fallback: ${readModel.error ?? 'unknown'}`
              : `source status: ${readModel.market.source_status.overall} | freshness=${freshness.level} (${freshness.minutes}m) | sources ${coverageMetrics} metrics${
                  coverageCompleteness != null ? ` · completeness ${(coverageCompleteness * 100).toFixed(0)}%` : ''
                }`
          }
        />
        <MetricCard
          label="Top risk signal"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
          valueHref={riskHref}
        />
        <MetricCard
          label="Germany jet fuel page"
          value="Open live page"
          hint="SSR market page with Brent / global jet / EU jet proxy / carbon and 1d/7d/30d changes"
          cardHref="/prices/germany-jet-fuel"
        />
        <MetricCard
          label="Data freshness"
          value={freshness.level.toUpperCase()}
          hint={`Age ${freshness.minutes}m · fresh≤${freshness.freshMaxMinutes}m · stale≤${freshness.staleMaxMinutes}m · as_of ${formatAsOf(readModel.market.generated_at)}`}
          valueClassName={
            freshness.level === 'fresh'
              ? 'text-emerald-300'
              : freshness.level === 'stale'
                ? 'text-amber-300'
                : 'text-rose-300'
          }
          valueHref="/sources"
        />
      </section>

      <section className="mt-8">
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <InfoCard title="Dashboard capabilities" subtitle="Product features">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Data sources" subtitle="Honest coverage labels">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>• Brent: EIA / FRED public series (daily lag possible)</p>
            <p>• Jet: FRED Gulf + ARA/Rotterdam public proxy when available</p>
            <p>• Carbon: CBAM+ECB proxy and/or EEX EU ETS when parseable</p>
            <p>• Seed/fallback is always labeled — open Trust Center for as-of, lag, status.</p>
            <p>
              <a href="/sources" className="text-sky-300 underline">
                Open /sources trust matrix →
              </a>
            </p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="Recent scenarios" subtitle="From FastAPI / PostgreSQL">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-300">
              {readModel.recentScenarioNames.map((name) => (
                <li key={name}>• {name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-300">
              No saved scenarios yet. Create one through the scenario API to verify CRUD end-to-end.
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
