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
  });

  it('omits alternates and never serializes "undefined" when alternateLanguages is absent', () => {
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en'
    });

    expect(metadata.alternates).toBeUndefined();
    expect((metadata.openGraph as { url?: string }).url).not.toContain('undefined');
  });

  it('uses the given image for openGraph and twitter', () => {
    const image = 'https://saf.meichen.beauty/custom-og.png';
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en',
      image
    });

    const openGraphImages = (metadata.openGraph as { images?: Array<{ url: string }> }).images;
    const twitterImages = (metadata.twitter as { images?: string[] }).images;
    expect(openGraphImages?.[0]?.url).toBe(image);
    expect(twitterImages?.[0]).toBe(image);
  });

  it('falls back to the default og image when none is given', () => {
    const metadata = buildPageMetadata({
      title: 'JetScope Europe',
      description: 'English entry point for JetScope.',
      path: '/en'
    });

    const defaultImage = `${baseUrl}/og-image.png`;
    const openGraphImages = (metadata.openGraph as { images?: Array<{ url: string }> }).images;
    const twitterImages = (metadata.twitter as { images?: string[] }).images;
    expect(openGraphImages?.[0]?.url).toBe(defaultImage);
    expect(twitterImages?.[0]).toBe(defaultImage);
  });
});
