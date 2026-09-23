import { LufthansaCase } from '@/components/lufthansa-case';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa SAF Inflection Review',
  description:
    'English review of the Lufthansa short-haul flight-cut signal, SAF breakeven economics, Germany supply-chain context, and JetScope review actions.',
  path: '/en/lufthansa-saf-2026',
  alternateLanguages: {
    'zh-CN': '/analysis/lufthansa-flight-cuts-2026-04',
    de: '/de/lufthansa-saf-2026',
    en: '/en/lufthansa-saf-2026'
  }
});

export default function EnglishLufthansaSafAnalysisPage() {
  return <LufthansaCase locale="en" />;
}
