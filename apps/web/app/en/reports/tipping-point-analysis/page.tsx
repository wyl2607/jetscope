import { TippingPointReportPage } from '@/components/tipping-point-report-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Tipping-Point Report',
  description:
    'English JetScope report detail for SAF tipping-point evidence, market source confidence, reserve stress, and research posture.',
  path: '/en/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
});

export default function EnglishTippingPointReportPage() {
  return <TippingPointReportPage locale="en" />;
}
