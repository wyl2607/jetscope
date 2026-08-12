import { FaqPage } from '@/components/faq-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = buildPageMetadata({
  title: 'Häufige Fragen',
  description:
    'JetScope FAQ zu Startbereitschaft, Quellenprüfung, Forschungswerkstatt, Szenario-Schreibvorgängen und geschützten Operationen.',
  path: '/de/faq',
  alternateLanguages: {
    'zh-CN': '/faq',
    en: '/en/faq',
    de: '/de/faq'
  }
});

export default function GermanFaqPage() {
  return <FaqPage locale="de" />;
}
