import { AdminPage } from '@/components/admin-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Startbereitschaft',
  description:
    'Deutsche JetScope-Ansicht für Startvoraussetzungen, geschützte Operationen und Wiederherstellungspfade für Quellen, Token und Forschungssignale.',
  path: '/de/admin',
  alternateLanguages: {
    'zh-CN': '/admin',
    de: '/de/admin',
    en: '/en/admin'
  }
});

export default function GermanAdminPage() {
  return <AdminPage locale="de" />;
}
