import type { Metadata } from 'next';

interface SEOOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
  alternateLanguages?: Record<string, string>;
}

export function buildPageMetadata(options: SEOOptions): Metadata {
  const baseUrl = 'https://saf.meichen.beauty';
  const url = `${baseUrl}${options.path}`;
  
  return {
    title: options.title,
    description: options.description,
    openGraph: {
      title: options.title,
      description: options.description,
      url: url,
      siteName: 'SAFvsOil',
      images: [
        {
          url: options.image || `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
        },
      ],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: options.title,
      description: options.description,
      images: [options.image || `${baseUrl}/og-image.png`],
    },
    alternates: options.alternateLanguages ? {
      languages: options.alternateLanguages,
    } : undefined,
  };
}
