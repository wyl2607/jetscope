import { LufthansaCase } from '@/components/lufthansa-case';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa SAF Inflexion',
  description: 'Analyse des Lufthansa-Ereignisses: 20.000 gestrichene Flüge, SAF-Breakeven-Modell und deutsche Lieferkettenvorteile.',
  path: '/de/lufthansa-saf-2026',
  alternateLanguages: {
    'zh-CN': '/analysis/lufthansa-flight-cuts-2026-04',
    en: '/en/lufthansa-saf-2026',
    de: '/de/lufthansa-saf-2026'
  }
});

export default function GermanLufthansaSafAnalysisPage() {
  return <LufthansaCase locale="de" />;
}
