import { GermanyJetFuelPage } from '@/components/germany-jet-fuel-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '德国航油价格',
  description:
    '可索引的德国航油 SSR 视图，展示 Brent、全球航油、EU 航油代理价、碳价代理及 1d/7d/30d 市场变化。',
  path: '/prices/germany-jet-fuel',
  alternateLanguages: {
    'zh-CN': '/prices/germany-jet-fuel',
    en: '/en/prices/germany-jet-fuel',
    de: '/de/prices/germany-jet-fuel'
  }
});

export default function ZhGermanyJetFuelPricePage() {
  return <GermanyJetFuelPage locale="zh" />;
}
