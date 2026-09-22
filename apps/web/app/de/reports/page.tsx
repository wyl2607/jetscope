import { ReportsPage } from '@/components/reports-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Berichtswerkstatt',
  description:
    'Deutsche JetScope-Berichtswerkstatt für Quellenstatus, gespeicherte Szenarien, Risikosignale und Startprüfung vor Veröffentlichung.',
  path: '/de/reports',
  alternateLanguages: {
    'zh-CN': '/reports',
    de: '/de/reports',
    en: '/en/reports'
  }
});

export default function GermanReportsPage() {
  return <ReportsPage locale="de" />;
}
