import { LufthansaAnalysisDE } from '../lufthansa-flight-cuts-2026-04/page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa-Treibstoffkrise 2026: SAF-Chancen für Deutschland',
  description: 'Analyse: Warum Lufthansas Kürzung von 20.000 Flügen die SAF-Nachfrage in Deutschland transformiert. Energiewirtschaft, Kosteneffektivität, ReFuelEU-Roadmap.',
  path: '/analysis/lufthansa-2026-de',
  alternateLanguages: {
    'en': '/analysis/lufthansa-flight-cuts-2026-04',
    'zh': '/analysis/lufthansa-flight-cuts-2026-04',
  },
});

export default function LufthansaAnalysisDEPage() {
  return <LufthansaAnalysisDE />;
}
