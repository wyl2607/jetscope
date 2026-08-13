/**
 * Typed access to `src/locales/{zh,de,en}.json`.
 *
 * Contract: docs/UI_CONTRACT.md section 4 rule 3. User-facing copy lives in
 * those files; this module is how a page reaches it. `zh` is the reference
 * shape, so a key added to one file and forgotten in another fails typecheck
 * instead of rendering `undefined` to a reader.
 *
 * Callers pass the locale the route file already knows. There is no middleware
 * and no `/[locale]` rewrite.
 */

import type { NavLocale } from '@/lib/navigation';
import de from '@/src/locales/de.json';
import en from '@/src/locales/en.json';
import zh from '@/src/locales/zh.json';

/** `satisfies` ties this list to navigation's locale union, so the two cannot drift. */
export const LOCALES = ['zh', 'de', 'en'] as const satisfies readonly NavLocale[];

export type Locale = (typeof LOCALES)[number];

/**
 * Widen JSON string literals so `de` / `en` can be checked against the `zh`
 * shape without requiring the same words.
 */
type WidenStrings<T> = T extends string
  ? string
  : T extends boolean
    ? boolean
    : T extends number
      ? number
      : T extends readonly (infer U)[]
        ? WidenStrings<U>[]
        : T extends object
          ? { [K in keyof T]: WidenStrings<T[K]> }
          : T;

/** The reference shape. Adding a key here obliges `de.json` and `en.json`. */
export type Messages = WidenStrings<typeof zh>;

export type FaqMessages = Messages['faq'];
export type CrisisMessages = Messages['crisis'];

const catalog: Record<Locale, Messages> = { zh, de, en };

export function messagesFor(locale: Locale): Messages {
  return catalog[locale];
}
