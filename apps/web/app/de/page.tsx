import { HomePage } from '@/components/home-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Deutschland',
  description: 'Indexierbare deutsche Startseite für JetScope mit Einstieg in Dashboard und Deutschland Jet-Fuel-Preisbeobachtung.',
  path: '/de'
});

export default function GermanIndexPage() {
  return <HomePage locale="de" />;
}
