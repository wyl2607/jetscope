import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { getDashboardReadModel, getPriceTrendChartReadModel, type DashboardReadModel } from '@/lib/product-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

// ---------------------------------------------------------------------------
// Alert banner thresholds — env-overrideable
// ---------------------------------------------------------------------------
function envNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

const JET_PRICE_ALERT_THRESHOLD_USD_PER_L = envNumber('SAFVSOIL_ALERT_JET_PRICE_USD_PER_L', 1.30);
const BRENT_DAILY_CHANGE_ALERT_PCT = envNumber('SAFVSOIL_ALERT_BRENT_DAILY_CHANGE_PCT', 5.0);

const priorities = [
  '实时市场数据：Brent / jet proxy / carbon proxy',
  '统一情景计算：价格、补贴、碳价、break-even',
  '管理后台：路线假设、政策参数、数据来源',
  '导出/汇报：图表、快照、scenario comparison'
];

type AlertBanner = {
  level: 'alert' | 'watch';
  title: string;
  message: string;
  href?: string;
};

function computeAlertBanners(
  market: DashboardReadModel['market'],
  risk: DashboardReadModel['topRiskSignal']
): AlertBanner[] {
  const banners: AlertBanner[] = [];
  const values = market?.values ?? {};

  const jetEu = values.jet_eu_proxy_usd_per_l ?? values.jet_usd_per_l ?? 0;
  if (Number.isFinite(jetEu) && jetEu >= JET_PRICE_ALERT_THRESHOLD_USD_PER_L) {
    banners.push({
      level: 'alert',
      title: 'Jet Fuel Price Alert',
      message: `EU jet proxy reached $${jetEu.toFixed(3)}/L (threshold $${JET_PRICE_ALERT_THRESHOLD_USD_PER_L.toFixed(2)}/L). Short-haul margins under severe pressure.`,
      href: '/crisis/eu-jet-reserves'
    });
  }

  const brent1d = risk?.metricKey === 'brent_usd_per_bbl' && risk.window === '1d' ? risk.changePct : undefined;
  if (Number.isFinite(brent1d ?? NaN) && Math.abs(brent1d!) >= BRENT_DAILY_CHANGE_ALERT_PCT) {
    const direction = (brent1d! > 0) ? 'surged' : 'dropped';
    banners.push({
      level: 'alert',
      title: 'SAF Inflection Alert',
      message: `Brent ${direction} ${Math.abs(brent1d!).toFixed(2)}% in 1d. SAF competitiveness gap narrowing rapidly.`,
      href: '/crisis/eu-jet-reserves'
    });
  }

  // General watch: if any metric moved >10% in 1d but not yet at alert threshold
  if (risk && risk.level === 'watch' && risk.window === '1d' && banners.length === 0) {
    banners.push({
      level: 'watch',
      title: 'Market Watch',
      message: `${risk.metric} moved ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}% in 1d. Monitor for inflection signals.`,
      href: '/sources'
    });
  }

  return banners;
}

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

  const alertBanners = computeAlertBanners(readModel.market, risk);

  return (
    <Shell
      eyebrow="Product dashboard"
      title="SAF vs Oil decision cockpit"
      description="B-5 垂直切片：该页现在直接读取 FastAPI + PostgreSQL 的 market snapshot 和 scenario registry（API 不可达时会降级到安全默认值）。"
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
        <InfoCard title="What this dashboard will own" subtitle="正式产品前端职责">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Current migration rule" subtitle="从 prototype 到 product">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>1. 先用垂直切片把 market + scenarios 数据链路打通，再扩大覆盖面。</p>
            <p>2. API 不可达时 dashboard 仍保留安全降级，避免空白页。</p>
            <p>3. 下一步把 compare/sweep 写入和读取都迁到同一工作区模型。</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="Recent scenarios" subtitle="来自 FastAPI / PostgreSQL">
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
