import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPageMetadata } from '../apps/web/lib/seo.ts';

const BASE_URL = 'https://saf.meichen.beauty';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

test('buildPageMetadata maps title, description, canonical URL, and default social image', () => {
  const metadata = buildPageMetadata({
    title: 'SAF market dashboard',
    description: 'Live sustainable aviation fuel market intelligence.',
    path: '/dashboard'
  });

  assert.equal(metadata.title, 'SAF market dashboard');
  assert.equal(metadata.description, 'Live sustainable aviation fuel market intelligence.');
  assert.deepEqual(metadata.openGraph, {
    title: 'SAF market dashboard',
    description: 'Live sustainable aviation fuel market intelligence.',
    url: `${BASE_URL}/dashboard`,
    siteName: 'JetScope',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630
      }
    ],
    type: 'article'
  });
  assert.deepEqual(metadata.twitter, {
    card: 'summary_large_image',
    title: 'SAF market dashboard',
    description: 'Live sustainable aviation fuel market intelligence.',
    images: [DEFAULT_OG_IMAGE]
  });
  assert.equal(metadata.alternates, undefined);
});

test('buildPageMetadata uses provided social image for Open Graph and Twitter', () => {
  const image = 'https://cdn.example.com/jetscope-report.png';

  const metadata = buildPageMetadata({
    title: 'Lufthansa SAF report',
    description: 'Route-level exposure analysis for Lufthansa.',
    path: '/analysis/lufthansa-2026-de',
    image
  });

  assert.equal(metadata.openGraph?.url, `${BASE_URL}/analysis/lufthansa-2026-de`);
  assert.deepEqual(metadata.openGraph?.images, [
    {
      url: image,
      width: 1200,
      height: 630
    }
  ]);
  assert.deepEqual(metadata.twitter?.images, [image]);
});

test('buildPageMetadata includes alternate language metadata only when provided', () => {
  const alternateLanguages = {
    en: '/analysis/lufthansa-2026-de',
    de: '/de/lufthansa-saf-2026'
  };

  const metadata = buildPageMetadata({
    title: 'Lufthansa SAF analysis',
    description: 'Bilingual SAF exposure analysis.',
    path: '/analysis/lufthansa-2026-de',
    alternateLanguages
  });

  assert.deepEqual(metadata.alternates, {
    languages: alternateLanguages
  });
  assert.deepEqual(metadata.openGraph?.images, [
    {
      url: DEFAULT_OG_IMAGE,
      width: 1200,
      height: 630
    }
  ]);
});
