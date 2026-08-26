import { CrisisPage } from '@/components/crisis-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '危机监测',
  description: '在一个运营危机监测视图中跟踪储备覆盖、临界事件与 SAF 经济性跨越。',
  path: '/crisis',
  alternateLanguages: {
    'zh-CN': '/crisis',
    en: '/en/crisis',
    de: '/de/crisis'
  }
});

export default function ZhCrisisPage() {
  return <CrisisPage locale="zh" />;
}
