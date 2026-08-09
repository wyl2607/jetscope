/**
 * Locale plumbing for the `/[locale]` routes.
 *
 * Contract: docs/UI_CONTRACT.md section 4. Rule 3 puts user-facing copy in
 * `src/locales/{zh,de,en}.json` rather than in components; this module is how a
 * page reaches it. Rule 4 serves `zh` at `/` with no prefix, which `middleware.ts`
 * implements by rewriting - so `locale` is always a real segment by the time a
 * page runs, even when the reader's URL has none.
 *
 * `zh` is the reference locale: its file defines the shape, and the other two
 * are type-checked against it, so a key added to one and forgotten in another
 * fails the build instead of rendering `undefined` to a reader.
 */

import type { NavLocale } from '@/lib/navigation';
import de from '@/src/locales/de.json';
import en from '@/src/locales/en.json';
import zh from '@/src/locales/zh.json';

/** `satisfies` ties this list to navigation's locale union, so the two cannot drift. */
export const LOCALES = ['zh', 'de', 'en'] as const satisfies readonly NavLocale[];

export type Locale = (typeof LOCALES)[number];

/** The reference shape. Adding a key here obliges `de.json` and `en.json`. */
export type Dictionary = typeof zh;

const DICTIONARIES: Record<Locale, Dictionary> = { zh, de, en };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * The href a route takes in a given locale. `zh` has no prefix (rule 4), so it
 * is the one case where the locale contributes nothing to the path.
 */
export function localeHref(locale: Locale, path: string): string {
  const suffix = path === '/' ? '' : path;
  return locale === 'zh' ? suffix || '/' : `/${locale}${suffix}`;
}
