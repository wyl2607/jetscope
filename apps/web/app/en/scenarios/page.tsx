import { ScenariosPage } from '@/components/scenarios-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Scenario Workbench',
  description:
    'English JetScope scenario review surface for saved assumptions, market context, risk signals, and protected write boundaries.',
  path: '/en/scenarios',
  alternateLanguages: {
    'zh-CN': '/scenarios',
    de: '/de/scenarios',
    en: '/en/scenarios'
  }
});

export default function EnglishScenariosPage() {
  return <ScenariosPage locale="en" />;
}
