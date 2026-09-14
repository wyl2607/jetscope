import { GermanyJetFuelMonitor } from '@/components/germany-jet-fuel-monitor';
import { PageTemplate } from '@/components/page-template';
import { germanyJetFuelCopy } from '@/lib/germany-jet-fuel-copy';
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

export default async function GermanyJetFuelPricePage() {
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel(),
    getPriceTrendChartReadModel()
  ]);
  const observedAsOf = readModel.quoteAsOf ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;
  const copy = germanyJetFuelCopy.zh;

  return (
    <PageTemplate
      eyebrow="价格 · 德国"
      title="德国航油价格监测"
      question="德国航油当前价，是不是已经偏离到需要重新看合同或套保的程度？"
      asOf={asOf}
    >
      <GermanyJetFuelMonitor locale="zh" copy={copy} initialReadModel={readModel} initialChart={priceChartData} />
    </PageTemplate>
  );
}
