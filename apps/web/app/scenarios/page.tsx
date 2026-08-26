import { ScenariosPage } from '@/components/scenarios-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '情景工作区',
  description: '管理 SAF 转型情景、比较政策路径，并通过持久化情景库工作流监测就绪度信号。',
  path: '/scenarios',
  alternateLanguages: {
    'zh-CN': '/scenarios',
    de: '/de/scenarios',
    en: '/en/scenarios'
  }
});

export default function ZhScenariosPage() {
  return <ScenariosPage locale="zh" />;
}
