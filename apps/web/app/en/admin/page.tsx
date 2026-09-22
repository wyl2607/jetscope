import { AdminPage } from '@/components/admin-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Launch Readiness',
  description:
    'English JetScope launch-readiness surface for prerequisites, protected operations, and source/research recovery links.',
  path: '/en/admin',
  alternateLanguages: {
    'zh-CN': '/admin',
    en: '/en/admin'
  }
});

export default function EnglishAdminPage() {
  return <AdminPage locale="en" />;
}
