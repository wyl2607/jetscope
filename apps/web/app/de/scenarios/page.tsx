import { ScenariosPage } from '@/components/scenarios-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Szenario-Workbench',
  description:
    'Deutsche JetScope-Ansicht für gespeicherte SAF-Übergangsannahmen, Marktkontext, Risikosignale und geschützte Schreibgrenzen.',
  path: '/de/scenarios',
  alternateLanguages: {
    'zh-CN': '/scenarios',
    de: '/de/scenarios',
    en: '/en/scenarios'
  }
});

export default function GermanScenariosPage() {
  return <ScenariosPage locale="de" />;
}
