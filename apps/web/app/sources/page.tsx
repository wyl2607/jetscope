import { loadSourcesPageProps, SourcesPage } from '@/components/sources-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '来源 · Trust Center',
  description:
    '查看 JetScope 来源溯源、as-of、置信度、滞后、回退状态与 market refresh 健康度。',
  path: '/sources'
});

export default async function ZhSourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SourcesPage {...await loadSourcesPageProps('zh', searchParams)} />;
}
