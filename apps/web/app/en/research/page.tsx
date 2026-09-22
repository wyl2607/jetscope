import { ResearchPage } from '@/components/research-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Research Workbench',
  description:
    'English JetScope research workbench for AI research pipeline status, signal counts, confidence, and evidence handoffs.',
  path: '/en/research',
  alternateLanguages: {
    'zh-CN': '/research',
    en: '/en/research'
  }
});

export default function EnglishResearchPage() {
  return <ResearchPage locale="en" />;
}
