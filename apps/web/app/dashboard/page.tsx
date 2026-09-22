import { DashboardPage } from '@/components/dashboard-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '决策驾驶舱',
  description:
    '可持续航空燃料与传统航油的实时决策看板，覆盖市场快照、情景库状态与转型交付信号。',
  path: '/dashboard',
  alternateLanguages: {
    'zh-CN': '/dashboard',
    en: '/en/dashboard',
    de: '/de/dashboard'
  }
});

export default function ZhDashboardPage() {
  return <DashboardPage locale="zh" />;
}
