import { CrisisPage } from '@/components/crisis-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Fuel Stress Brief',
  description:
    'English JetScope crisis monitor for EU jet-fuel reserve stress, source confidence, tipping events, and research posture.',
  path: '/en/crisis',
  alternateLanguages: {
    'zh-CN': '/crisis',
    de: '/de/crisis',
    en: '/en/crisis'
  }
});

export default function EnglishCrisisPage() {
  return <CrisisPage locale="en" />;
}
