import { GermanyJetFuelPage } from '@/components/germany-jet-fuel-page';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Germany Jet-Fuel Price Monitor',
  description:
    'English Germany jet-fuel market view for Brent, global jet fuel, EU jet proxy, carbon proxy, and 1d/7d/30d source-backed changes.',
  path: '/en/prices/germany-jet-fuel',
  alternateLanguages: {
    'zh-CN': '/prices/germany-jet-fuel',
    de: '/de/prices/germany-jet-fuel',
    en: '/en/prices/germany-jet-fuel'
  }
});

export default function EnglishGermanyJetFuelPricePage() {
  return <GermanyJetFuelPage locale="en" />;
}
