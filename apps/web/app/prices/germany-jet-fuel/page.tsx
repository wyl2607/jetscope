import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '德国航油价格',
  description:
    '可索引的德国航油 SSR 视图，展示 Brent、全球航油、EU 航油代理价、碳价代理及 1d/7d/30d 市场变化。',
  path: '/prices/germany-jet-fuel'
});

function formatMetricValue(value: number | null, digits: number, unit: string): string {
  if (!Number.isFinite(value ?? NaN)) return `n/a ${unit}`;
  return `${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} ${unit}`;
}

function formatChange(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function changeClass(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'text-slate-400';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-rose-300';
  if (magnitude >= 10) return 'text-amber-300';
  return 'text-emerald-300';
}

function formatAsOf(value: string | null): string {
  if (!value) return '暂无最新校验时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无最新校验时间';
  return `更新于 ${date.toLocaleString()}`;
}

function statusLabel(status: string): string {
  if (status === 'live') return '实时来源';
  if (status === 'proxy') return '代理来源';
  if (status === 'degraded') return '回退估算';
  return '来源状态待确认';
}

function metricDisplayLabel(label: string): string {
  if (label === 'Brent') return 'Brent 原油';
  if (label === 'Jet fuel') return '全球航油';
  if (label === 'Jet fuel (EU proxy)') return 'EU 航油代理价';
  if (label === 'Carbon proxy') return '碳价代理';
  return label;
}

function metricNoteLabel(note: string): string {
  return note
    .replace('Fallback from Jet fuel', '从全球航油回退')
    .replace('Fallback from Brent', '从 Brent 回退')
    .replace('Fallback from Carbon proxy', '从碳价代理回退');
}

const sourceLinks = [
  { href: '/sources?focus=brent_usd_per_bbl', label: 'Brent 来源状态', key: 'brent_usd_per_bbl' },
  { href: '/sources?focus=jet_usd_per_l', label: '全球航油来源状态', key: 'jet_usd_per_l' },
  {
    href: '/sources?focus=jet_eu_proxy_usd_per_l',
    label: 'EU 航油代理来源状态',
    key: 'jet_eu_proxy_usd_per_l'
  },
  { href: '/sources?focus=carbon_proxy_usd_per_t', label: '碳价代理来源状态', key: 'carbon_proxy_usd_per_t' }
] as const;

export default async function GermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel(),
    getPriceTrendChartReadModel()
  ]);

  return (
    <Shell
      eyebrow="价格 · 德国"
      title="德国航油价格监测"
      description="面向德国市场的 Brent、全球航油、EU 航油代理价与碳价压力视图，附带短周期变化窗口。"
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {readModel.metrics.map((metric) => (
          <InfoCard
            key={metric.metricKey}
            title={metricDisplayLabel(metric.label)}
            subtitle={`${formatAsOf(metric.latestAsOf)} · ${statusLabel(readModel.overallStatus)}`}
          >
            <p className="text-3xl font-semibold text-white">{formatMetricValue(metric.value, metric.digits, metric.unit)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-slate-500">1d</p>
                <p className={changeClass(metric.changePct1d)}>{formatChange(metric.changePct1d)}</p>
              </div>
              <div>
                <p className="text-slate-500">7d</p>
                <p className={changeClass(metric.changePct7d)}>{formatChange(metric.changePct7d)}</p>
              </div>
              <div>
                <p className="text-slate-500">30d</p>
                <p className={changeClass(metric.changePct30d)}>{formatChange(metric.changePct30d)}</p>
              </div>
            </div>
            {metric.note ? <p className="mt-3 text-xs text-amber-300">{metricNoteLabel(metric.note)}</p> : null}
          </InfoCard>
        ))}
      </section>

      <section className="mt-8">
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <InfoCard title="风险说明" subtitle="用于决策支持，不用于交易执行">
          <ul className="space-y-2 text-sm leading-7 text-slate-300">
            <li>• 航油价格为代理指标，可能与德国具体机场的合约结算价存在差异。</li>
            <li>• 区域数据源不可用时，EU 航油代理价可能临时回退到全球航油序列。</li>
            <li>• 碳价代理跟踪政策成本压力，应结合航线与掺混假设解读。</li>
            <li>• 用于采购决策时，请与合约供应商报价交叉核验。</li>
          </ul>
        </InfoCard>

        <InfoCard title="来源" subtitle="追踪每个指标的溯源详情">
          <ul className="space-y-3 text-sm text-slate-300">
            {sourceLinks.map((source) => (
              <li key={source.key}>
                <a className="underline decoration-sky-500/40 hover:decoration-sky-300" href={source.href}>
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            生成于 {new Date(readModel.generatedAt).toLocaleString()}
            {readModel.isFallback ? ' · 实时市场历史不可用时显示回退估算' : ''}
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
