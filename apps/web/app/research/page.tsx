import { ResearchPage } from '@/components/research-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '研究工作台',
  description: 'AI 辅助的 SAF 与航油研究信号工作台，附带启用状态、置信度与复核动作。',
  path: '/research'
});

export default function ZhResearchPage() {
  return <ResearchPage locale="zh" />;
}
