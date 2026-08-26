import { ReportsPage } from '@/components/reports-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '报告工作台',
  description: 'JetScope SAF 临界点分析的报告工作台，展示来源状态、情景数量与风险信号。',
  path: '/reports',
  alternateLanguages: {
    'zh-CN': '/reports',
    en: '/en/reports',
    de: '/de/reports'
  }
});

export default function ZhReportsPage() {
  return <ReportsPage locale="zh" />;
}
