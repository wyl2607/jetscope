import { NextResponse, type NextRequest } from 'next/server';

/**
 * Serves `zh` at `/` while every migrated page lives under `app/[locale]`.
 *
 * Contract: docs/UI_CONTRACT.md section 4 rule 4. A `[locale]` segment and a
 * prefix-free default locale cannot coexist by routing alone - `/dashboard`
 * would match `[locale]` with `locale = "dashboard"`. So the unprefixed request
 * is rewritten to `/zh/...` internally; the reader's URL never changes.
 *
 * MIGRATED is what makes P2 incremental. Rewriting every unprefixed path at
 * once would 404 every route that has not moved under `app/[locale]` yet, so a
 * route joins this list in the same commit that moves it. When the last route
 * moves, this list becomes "everything" and collapses to a single check - and
 * `de` and `en` need no entry at all, because their prefix already selects the
 * segment.
 *
 * `match: 'exact'` is required when a parent path has migrated but a child has
 * not (e.g. `/reports` vs `/reports/tipping-point-analysis`). A prefix match
 * would rewrite the child to `/zh/reports/tipping-point-analysis`, which does
 * not exist under `[locale]` yet and 404s.
 */
const MIGRATED = [
  { path: '/faq', match: 'prefix' },
  { path: '/reports', match: 'exact' }
] as const;

/** Exported for unit tests — must stay pure (no Next request objects). */
export function isMigrated(pathname: string): boolean {
  return MIGRATED.some(({ path, match }) =>
    match === 'exact'
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // A `/zh/... -> /...` redirect used to sit here, to keep one page off two
  // URLs. It took production down. In a production build the rewrite below
  // re-enters this middleware as `/zh/faq`; the redirect sent that back to
  // `/faq`; the rewrite fired again. `/faq` 308ed to itself forever, and only
  // the default locale was affected, because only it is rewritten.
  //
  // `next dev` did not reproduce it - which is the reason a routing change is
  // now only believable after `next build && next start`, never after dev.
  //
  // Canonicalising `/zh/*` is still worth having. It has to be written so it
  // cannot see an internally rewritten request, and proven against a production
  // build before it ships again.
  if (isMigrated(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/zh${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets, the API proxy, and files with an
  // extension - those must reach their handlers untouched.
  matcher: ['/((?!_next/|api/|.*\\.).*)']
};
