import { DashboardPage } from '@/components/dashboard-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Entscheidungscockpit',
  description:
    'Deutsches JetScope-Dashboard mit Live-Marktsnapshot, Szenarioregister und Risikosignal für SAF-gegen-Kerosin-Entscheidungen.',
  path: '/de/dashboard',
  alternateLanguages: {
    'zh-CN': '/dashboard',
    en: '/en/dashboard',
    de: '/de/dashboard'
  }
});

export default function GermanDashboardPage() {
  return <DashboardPage locale="de" />;
}
