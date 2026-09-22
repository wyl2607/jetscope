import { DashboardPage } from '@/components/dashboard-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Decision Cockpit',
  description:
    'English JetScope dashboard for SAF versus jet-fuel decisions, including market snapshot, scenarios, source posture, and launch-readiness actions.',
  path: '/en/dashboard',
  alternateLanguages: {
    'zh-CN': '/dashboard',
    en: '/en/dashboard',
    de: '/de/dashboard'
  }
});

export default function EnglishDashboardPage() {
  return <DashboardPage locale="en" />;
}
