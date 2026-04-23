import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import Script from 'next/script';

const SITE_NAME = 'JetScope';
const SITE_URL = 'https://saf.meichen.beauty';
const SITE_DESCRIPTION =
  'SAF versus fossil jet fuel decision cockpit with market snapshots, scenario comparison, and source provenance.';
const DEFAULT_KEYWORDS = [
  'SAF',
  'jet fuel',
  'aviation fuel',
  'sustainable aviation fuel',
  'Lufthansa',
  'ReFuelEU',
  'fuel cost analysis',
  'EU ETS'
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: '%s | JetScope'
  },
  description: SITE_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: 'zh_CN'
  },
  twitter: {
    card: 'summary_large_image',
    site: '@jetscope',
    creator: '@jetscope',
    title: SITE_NAME,
    description: SITE_DESCRIPTION
  },
  alternates: {
    canonical: '/',
    languages: {
      'zh-CN': '/',
      en: '/',
      de: '/de'
    }
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: ['zh-CN', 'en', 'de'],
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL
    }
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    sameAs: [SITE_URL]
  };

  return (
    <html lang="zh-CN">
      <body>
        <Script id="jetscope-jsonld-website" type="application/ld+json">
          {JSON.stringify(websiteJsonLd)}
        </Script>
        <Script id="jetscope-jsonld-organization" type="application/ld+json">
          {JSON.stringify(organizationJsonLd)}
        </Script>
        {children}
      </body>
    </html>
  );
}
