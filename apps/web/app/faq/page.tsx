import { FaqPage } from '@/components/faq-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = buildPageMetadata({
  title: '常见问题',
  description: 'JetScope 上线前置状态、数据来源、研究信号、情景写入和受保护操作的常见问题说明。',
  path: '/faq',
  alternateLanguages: {
    'zh-CN': '/faq',
    en: '/en/faq',
    de: '/de/faq'
  }
});

export default function ZhFaqPage() {
  return <FaqPage locale="zh" />;
}
