/**
 * The single source of truth for JetScope's primary navigation.
 *
 * Contract: docs/UI_CONTRACT.md section 4. Literal nav arrays anywhere else -
 * shell.tsx in particular - are a contract violation and fail
 * `scripts/design-token-lint.mjs`.
 *
 * Each entry declares its path per locale. `null` means the route does not
 * exist in that locale *yet*: it is the P2 backlog, expressed as data instead of
 * as three hand-copied arrays that quietly drifted apart. The contract's end
 * state (section 4 rule 2) is that no entry has a null path.
 */

export type NavLocale = 'zh' | 'de' | 'en';

export type NavEntry = Readonly<{
  id: string;
  path: Readonly<Record<NavLocale, string | null>>;
  label: Readonly<Record<NavLocale, string>>;
}>;

export type NavItem = Readonly<{ href: string; label: string }>;

/** Canonical order. One order for every locale - that is the point. */
export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    id: 'home',
    path: { zh: '/', de: '/de', en: '/en' },
    label: { zh: '首页', de: 'Startseite', en: 'Home' }
  },
  {
    id: 'dashboard',
    path: { zh: '/dashboard', de: '/de/dashboard', en: '/en/dashboard' },
    label: { zh: '决策驾驶舱', de: 'Entscheidungscockpit', en: 'Decision Cockpit' }
  },
  {
    id: 'crisis',
    path: { zh: '/crisis', de: '/de/crisis', en: '/en/crisis' },
    label: { zh: '危机监测', de: 'Krisenmonitor', en: 'Crisis Monitor' }
  },
  {
    id: 'prices',
    path: {
      zh: '/prices/germany-jet-fuel',
      de: '/de/prices/germany-jet-fuel',
      en: '/en/prices/germany-jet-fuel'
    },
    label: { zh: '价格', de: 'Preise', en: 'Prices' }
  },
  {
    // Grid and heat parity exist only in the default locale today.
    id: 'grid',
    path: { zh: '/grid', de: null, en: null },
    label: { zh: '电网平价', de: 'Netzparität', en: 'Grid Parity' }
  },
  {
    id: 'heat',
    path: { zh: '/heat', de: null, en: null },
    label: { zh: '供暖平价', de: 'Wärmeparität', en: 'Heat Parity' }
  },
  {
    id: 'scenarios',
    path: { zh: '/scenarios', de: '/de/scenarios', en: '/en/scenarios' },
    label: { zh: '情景推演', de: 'Szenarien', en: 'Scenarios' }
  },
  {
    id: 'research',
    path: { zh: '/research', de: '/de/research', en: '/en/research' },
    label: { zh: '研究信号', de: 'Forschung', en: 'Research' }
  },
  {
    id: 'reports',
    path: { zh: '/reports', de: '/de/reports', en: '/en/reports' },
    label: { zh: '分析报告', de: 'Berichte', en: 'Reports' }
  },
  {
    id: 'sources',
    path: { zh: '/sources', de: '/de/sources', en: '/en/sources' },
    label: { zh: '数据来源', de: 'Quellen', en: 'Sources' }
  },
  {
    // The Lufthansa deep dive lives at a locale-specific slug in de/en and at
    // /analysis in the default locale.
    id: 'analysis',
    path: { zh: '/analysis', de: '/de/lufthansa-saf-2026', en: '/en/lufthansa-saf-2026' },
    label: { zh: '专题分析', de: 'Analyse', en: 'Analysis' }
  },
  {
    id: 'admin',
    path: { zh: '/admin', de: '/de/admin', en: '/en/admin' },
    label: { zh: '管理', de: 'Bereitschaft', en: 'Admin' }
  },
  {
    id: 'faq',
    path: { zh: '/faq', de: '/de/faq', en: '/en/faq' },
    label: { zh: '常见问题', de: 'FAQ', en: 'FAQ' }
  }
] as const;

/** Nav items available in a locale, in canonical order. */
export function navigationFor(locale: NavLocale): readonly NavItem[] {
  return NAV_ENTRIES.flatMap((entry) => {
    const href = entry.path[locale];
    return href === null ? [] : [{ href, label: entry.label[locale] } as const];
  });
}

/** Routes still missing per locale - the P2 backlog, queryable in tests. */
export function missingRoutes(locale: NavLocale): readonly string[] {
  return NAV_ENTRIES.filter((entry) => entry.path[locale] === null).map((entry) => entry.id);
}

export function homeHrefFor(locale: NavLocale): string {
  return NAV_ENTRIES[0].path[locale] ?? '/';
}
