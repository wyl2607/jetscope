import { loadSourcesPageProps, SourcesPage } from '@/components/sources-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = buildPageMetadata({
  title: 'Source Review',
  description:
    'English JetScope source review surface for market provenance, fallback state, confidence, lag, and recovery actions.',
  path: '/en/sources',
  alternateLanguages: {
    'zh-CN': '/sources',
    en: '/en/sources'
  }
});

export const dynamic = 'force-dynamic';

export default async function EnglishSourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SourcesPage {...await loadSourcesPageProps('en', searchParams)} />;
}
