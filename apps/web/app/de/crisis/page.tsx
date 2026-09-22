import { CrisisPage } from '@/components/crisis-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Krisenbrief',
  description:
    'Deutscher JetScope-Krisenmonitor für EU-Kerosin-Reservestress, Quellenvertrauen, Kippereignisse und Forschungsstatus.',
  path: '/de/crisis',
  alternateLanguages: {
    'zh-CN': '/crisis',
    de: '/de/crisis',
    en: '/en/crisis'
  }
});

export default function GermanCrisisPage() {
  return <CrisisPage locale="de" />;
}
