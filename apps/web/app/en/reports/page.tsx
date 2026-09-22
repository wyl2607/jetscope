import { ReportsPage } from '@/components/reports-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Report Workbench',
  description:
    'English JetScope report readiness workbench for source status, saved scenarios, risk signals, and launch posture.',
  path: '/en/reports',
  alternateLanguages: {
    'zh-CN': '/reports',
    de: '/de/reports',
    en: '/en/reports'
  }
});

export default function EnglishReportsPage() {
  return <ReportsPage locale="en" />;
}
