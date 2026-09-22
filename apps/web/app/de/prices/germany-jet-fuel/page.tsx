import { GermanyJetFuelPage } from '@/components/germany-jet-fuel-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Deutschland Kerosinpreis',
  description:
    'Indexierbare serverseitig gerenderte Seite für Deutschland mit Brent, globalem Jet-Fuel, EU-Jet-Proxy, Carbon-Proxy und 1d/7d/30d-Änderung.',
  path: '/de/prices/germany-jet-fuel',
  alternateLanguages: {
    'zh-CN': '/prices/germany-jet-fuel',
    en: '/en/prices/germany-jet-fuel',
    de: '/de/prices/germany-jet-fuel'
  }
});

export default function GermanGermanyJetFuelPricePage() {
  return <GermanyJetFuelPage locale="de" />;
}
