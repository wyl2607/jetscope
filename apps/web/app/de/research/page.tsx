import { ResearchPage } from '@/components/research-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Forschungswerkstatt',
  description:
    'Deutsche JetScope-Forschungswerkstatt für AI-Research-Pipeline-Status, Signalanzahl, Konfidenz und Evidenzübergaben.',
  path: '/de/research',
  alternateLanguages: {
    'zh-CN': '/research',
    de: '/de/research',
    en: '/en/research'
  }
});

export default function GermanResearchPage() {
  return <ResearchPage locale="de" />;
}
