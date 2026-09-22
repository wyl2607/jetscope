import { loadSourcesPageProps, SourcesPage } from '@/components/sources-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Quellenprüfung',
  description:
    'Deutsche JetScope-Ansicht zur Prüfung von Marktdatenquellen, Fallback-Status, Vertrauen, Verzögerung und Wiederherstellungsaktionen.',
  path: '/de/sources',
  alternateLanguages: {
    'zh-CN': '/sources',
    de: '/de/sources',
    en: '/en/sources'
  }
});

export default async function GermanSourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SourcesPage {...await loadSourcesPageProps('de', searchParams)} />;
}
