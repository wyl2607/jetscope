import { HomePage } from '@/components/home-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope 航油转型决策入口',
  description: '用五分钟了解欧洲航油压力信号、SAF 转折点事件、EU ETS 成本影响与 AI 辅助研究工作流。',
  path: '/'
});

export default function ZhHomePage() {
  return <HomePage locale="zh" />;
}
