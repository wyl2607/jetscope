import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
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
  if (!Number.isFinite(value ?? NaN)) return 'text-warning';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
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

function decisionLabel(change: number | null, isFallback: boolean): string {
  if (isFallback || !Number.isFinite(change ?? NaN)) return '先复核来源';
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return '重看合同/套保';
  if (magnitude >= 10) return '需要复核';
  return '暂不需要重看';
}

function decisionTone(change: number | null, isFallback: boolean): string {
  if (isFallback || !Number.isFinite(change ?? NaN)) return 'text-danger';
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
}

function sourceBasis(sourceKey: string, isFallback: boolean): SourceRef['basis'] {
  if (isFallback) return 'assumption';
  // The price read model does not expose source_type. Proxy keys are explicit;
  // every other unmapped source follows the contract's assumption default.
  return sourceKey.includes('proxy') ? 'derived' : 'assumption';
}

export default async function GermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel(),
    getPriceTrendChartReadModel()
  ]);
  const euJetMetric = readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l') ?? readModel.metrics[0];
  // Verdict + 3 keeps the signal row within the 2-4 the contract allows. The
  // metric config is exactly four, so nothing is dropped today - a fifth one
  // would need a home rather than silently falling off the end.
  const signalMetrics = readModel.metrics.filter((metric) => metric.metricKey !== euJetMetric?.metricKey).slice(0, 3);
  const observedAsOf = readModel.metrics
    .map((metric) => metric.latestAsOf)
    .filter((value): value is string => value !== null && !Number.isNaN(new Date(value).getTime()))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
    .pop() ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;

  return (
    <PageTemplate
      eyebrow="价格 · 德国"
      title="德国航油价格监测"
      question="德国航油当前价，是不是已经偏离到需要重新看合同或套保的程度？"
      asOf={asOf}
    >
      <SignalRow label="德国航油决策信号">
        <MetricCard
          label="德国航油决策压力"
          value={decisionLabel(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          valueClassName={decisionTone(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          hint={euJetMetric
            ? `EU 航油代理 ${formatMetricValue(euJetMetric.value, euJetMetric.digits, euJetMetric.unit)} · 30d ${formatChange(euJetMetric.changePct30d)} · ${statusLabel(readModel.overallStatus)}`
            : 'EU 航油代理当前没有可用读数。'}
        />
        {signalMetrics.map((metric) => (
          <MetricCard
            key={metric.metricKey}
            label={metricDisplayLabel(metric.label)}
            value={formatMetricValue(metric.value, metric.digits, metric.unit)}
            valueClassName={readModel.isFallback ? 'text-warning' : changeClass(metric.changePct30d)}
            hint={`1d ${formatChange(metric.changePct1d)} · 7d ${formatChange(metric.changePct7d)} · 30d ${formatChange(metric.changePct30d)}${metric.note ? ` · ${metricNoteLabel(metric.note)}` : ''}`}
          />
        ))}
      </SignalRow>

      <Panel
        title="价格趋势"
        why="当前价只是一个点；只有把它放进 1d、7d、30d 窗口，才能判断偏离是否足以触发合同或套保复核。"
      >
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? `德国航油价格读模型不可用，当前为回退估算（${readModel.error ?? '未知原因'}）`
              : '德国航油价格读模型（Brent、全球航油、EU 航油代理与碳价代理）',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          ...sourceLinks.map((source) => ({
            id: source.key,
            label: source.label,
            href: source.href,
            asOf: readModel.isFallback
              ? null
              : readModel.metrics.find((metric) => metric.metricKey === source.key)?.latestAsOf ?? null,
            basis: sourceBasis(source.key, readModel.isFallback)
          })),
          {
            id: 'price-trend-read-model',
            label: priceChartData.isFallback
              ? `价格趋势历史不可用（${priceChartData.error ?? '未知原因'}）`
              : '价格趋势历史读模型（1d、7d、30d 窗口）',
            asOf: priceChartData.isFallback ? null : priceChartData.generatedAt,
            basis: priceChartData.isFallback ? 'assumption' : 'observed'
          }
        ]}
        methodHref="/sources"
        methodLabel="来源与价格趋势方法"
        limitations={[
          '航油价格是代理指标，可能与德国具体机场的合约结算价存在差异。',
          '区域数据源不可用时，EU 航油代理价可能临时回退到全球航油序列；回退值不能当作实测。',
          '碳价代理跟踪政策成本压力，应结合航线与掺混假设解读。',
          '本页用于决策支持，不用于交易执行；采购决策仍需与合约供应商报价交叉核验。'
        ]}
      />
    </PageTemplate>
  );
}
