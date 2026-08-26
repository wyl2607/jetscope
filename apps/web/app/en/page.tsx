import { HomePage } from '@/components/home-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Europe',
  description: 'English entry point for JetScope: European jet fuel stress signals, SAF tipping-point events, and launch-readiness context.',
  path: '/en',
  alternateLanguages: { 'zh-CN': '/', de: '/de', en: '/en' }
});

export default function EnglishHomePage() {
  return <HomePage locale="en" />;
}
