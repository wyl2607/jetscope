import { AdminPage } from '@/components/admin-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin',
  description:
    '上线前置状态。Operate JetScope policy assumptions, pathway parameters, and market refresh controls through the backoffice admin console.',
  path: '/admin'
});

export default function ZhAdminPage() {
  return <AdminPage locale="zh" />;
}
