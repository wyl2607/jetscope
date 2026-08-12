import { FaqPage } from '@/components/faq-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = buildPageMetadata({
  title: 'Frequently Asked Questions',
  description:
    'JetScope FAQ for launch readiness, source review, research workbench boundaries, scenario writes, and protected operations.',
  path: '/en/faq',
  alternateLanguages: {
    'zh-CN': '/faq',
    en: '/en/faq',
    de: '/de/faq'
  }
});

export default function EnglishFaqPage() {
  return <FaqPage locale="en" />;
}
