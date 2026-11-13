import { describe, expect, it } from 'vitest';
import { buildPageMetadata } from '@/lib/seo';

const baseUrl = 'https://saf.meichen.beauty';

describe('buildPageMetadata', () => {
  it('passes title and description through to the page, openGraph and twitter', () => {
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en'
    });

    expect(metadata.title).toBe('JetScope Europe');
    expect(metadata.description).toBe('English entry point for JetScope.');
    expect(metadata.openGraph?.title).toBe('JetScope Europe');
    expect(metadata.openGraph?.description).toBe('English entry point for JetScope.');
    expect(metadata.twitter?.title).toBe('JetScope Europe');
    expect(metadata.twitter?.description).toBe('English entry point for JetScope.');
  });

  it('builds the canonical openGraph url from the base url and the given path', () => {
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en'
    });

    const url = (metadata.openGraph as { url?: string }).url;
    expect(url).toBe(`${baseUrl}/en`);
    expect(url).toContain('/en');
  });

  it('passes alternateLanguages into alternates.languages', () => {
    const alternateLanguages = { 'zh-CN': '/', de: '/de', en: '/en' };
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en',
      alternateLanguages
    });

    expect(metadata.alternates?.languages).toEqual(alternateLanguages);
    expect(metadata.alternates?.languages).toHaveProperty('zh-CN', '/');
    expect(metadata.alternates?.languages).toHaveProperty('de', '/de');
  });

  it('omits alternates and never serializes the string "undefined" when options are absent', () => {
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en'
    });

    expect(metadata.alternates).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain('undefined');
    expect((metadata.openGraph as { url?: string }).url).not.toContain('undefined');
  });
});
