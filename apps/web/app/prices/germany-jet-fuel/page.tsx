import { GermanyJetFuelMonitor, type GermanyJetFuelCopy } from '@/components/germany-jet-fuel-monitor';
import { PageTemplate } from '@/components/page-template';
import { SourceFooter } from '@/components/source-footer';
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

const copy: GermanyJetFuelCopy = {
  signalLabel: '德国航油决策信号',
  decisionLabel: '德国航油决策压力',
  decisions: {
    insufficient: '历史不足',
    revisit: '重看合同/套保',
    review: '需要复核',
    stable: '暂不需要重看'
  },
  historyMissing: '历史不足',
  quoteDate: '行情日期',
  lastCheck: '上次检查',
  staleKeep: '刷新失败，保留上次有效行情',
  costTitle: '市场联动成本估算',
  costWhy: '在没有机场到机价和航班账单时，只估算燃油及合规成本如何随公开行情变动。',
  estimateBanner: '这是市场联动成本估算，不是航空公司真实账单。',
  airportLabel: '航线预设',
  fuelKgLabel: '耗油 kg',
  paxLabel: '旅客数',
  blendLabel: 'SAF 掺混 %',
  airportDiffLabel: '机场差额 EUR/t（待提供）',
  taxUseLabel: '税务用途',
  taxCommercial: '商业航空（默认免税）',
  taxPrivate: '私人用途（能源税情景）',
  perFlight: '每班燃油及合规',
  perPax: '每旅客',
  delivered: '到机估算',
  noAirportQuote: '德国机场价差待提供，当前未输出机场实测价。',
  methodLabel: '来源与价格趋势方法',
  limitations: [
    '航油价格是代理指标，可能与德国具体机场的合约结算价存在差异。',
    '区域数据源不可用时，EU 航油代理价可能临时回退到全球航油序列；回退值不能当作实测。',
    '碳价代理跟踪政策成本压力，应结合航线与掺混假设解读。',
    '本页用于决策支持，不用于交易执行；采购决策仍需与合约供应商报价交叉核验。',
    '未覆盖机组、维修、起降费等非燃油成本，故不显示航班总运营成本。'
  ]
};

export default async function GermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel(),
    getPriceTrendChartReadModel()
  ]);
  const observedAsOf = readModel.quoteAsOf ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;

  return (
    <PageTemplate
      eyebrow="价格 · 德国"
      title="德国航油价格监测"
      question="德国航油当前价，是不是已经偏离到需要重新看合同或套保的程度？"
      asOf={asOf}
    >
      <GermanyJetFuelMonitor locale="zh" copy={copy} initialReadModel={readModel} initialChart={priceChartData} />
      <SourceFooter
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? `德国航油价格读模型不可用，当前为回退估算（${readModel.error ?? '未知原因'}）`
              : '德国航油价格读模型（Brent、全球航油、EU 航油代理与碳价代理）',
            asOf,
            basis: readModel.isFallback ? 'assumption' : ('derived' as const)
          },
          ...sourceLinks.map((source) => ({
            id: source.key,
            label: source.label,
            href: source.href,
            asOf: readModel.isFallback
              ? null
              : readModel.metrics.find((metric) => metric.metricKey === source.key)?.observedAt ?? null,
            basis: readModel.isFallback ? ('assumption' as const) : ('derived' as const)
          })),
          {
            id: 'price-trend-read-model',
            label: priceChartData.isFallback
              ? `价格趋势历史不可用（${priceChartData.error ?? '未知原因'}）`
              : '价格趋势历史读模型（1d、7d、30d 窗口）',
            asOf: priceChartData.isFallback ? null : priceChartData.generatedAt,
            basis: priceChartData.isFallback ? ('assumption' as const) : ('derived' as const)
          }
        ]}
        methodHref="/sources"
        methodLabel="来源与价格趋势方法"
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
