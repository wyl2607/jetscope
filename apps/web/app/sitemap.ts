import type { MetadataRoute } from 'next';

const BASE_URL = 'https://saf.meichen.beauty';
const STABLE_LAST_MODIFIED = new Date('2026-04-22T00:00:00.000Z');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 1.0
    },
    {
      url: `${BASE_URL}/de`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.98
    },
    {
      url: `${BASE_URL}/dashboard`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.95
    },
    {
      url: `${BASE_URL}/de/dashboard`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.93
    },
    {
      url: `${BASE_URL}/prices/germany-jet-fuel`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.92
    },
    {
      url: `${BASE_URL}/de/prices/germany-jet-fuel`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.91
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.88
    },
    {
      url: `${BASE_URL}/sources`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.9
    },
    {
      url: `${BASE_URL}/analysis`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.9
    },
    {
      url: `${BASE_URL}/analysis/lufthansa-flight-cuts-2026-04`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.85
    },
    {
      url: `${BASE_URL}/scenarios`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.8
    },
    {
      url: `${BASE_URL}/crisis/eu-jet-reserves`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.94
    },
    {
      url: `${BASE_URL}/admin`,
      lastModified: STABLE_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.5
    }
  ];
}
