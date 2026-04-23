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

  return (
    <Shell
      eyebrow="Market Intelligence"
      title="SAF vs Oil Decision Cockpit"
      description="Live market snapshot, scenario modelling, and transition risk signals for sustainable aviation fuel decisions."
    >
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
              : `source status: ${readModel.market.source_status.overall} | freshness=${freshness.level} (${freshness.minutes}m)`
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

        <InfoCard title="Data sources" subtitle="Market coverage">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>• Brent Crude: Yahoo Finance (real-time)</p>
            <p>• EU ETS Carbon: Market proxy (real-time)</p>
            <p>• Jet Fuel / SAF: Modelled from Brent + crack spread + premium</p>
            <p>• Fallback values ensure the dashboard never shows a blank page.</p>
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
