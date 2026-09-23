import { TippingPointReportPage } from '@/components/tipping-point-report-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '临界点报告',
  description: '以数据支撑的 JetScope 报告页，解释欧洲航油压力与 SAF 切换经济性。',
  path: '/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
});

export default function ZhTippingPointReportPage() {
  return <TippingPointReportPage locale="zh" />;
}
