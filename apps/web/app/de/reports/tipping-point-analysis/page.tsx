import { TippingPointReportPage } from '@/components/tipping-point-report-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Kipppunktbericht',
  description:
    'Deutscher JetScope-Berichtsdetailblick für SAF-Kipppunkt, Quellenvertrauen, Reservestress und Forschungsstatus.',
  path: '/de/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
});

export default function GermanTippingPointReportPage() {
  return <TippingPointReportPage locale="de" />;
}
