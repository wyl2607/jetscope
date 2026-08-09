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
 */
const MIGRATED = ['/faq'] as const;

/** `/faq` and `/faq/anything`, but not `/faq-archive`. */
function isMigrated(pathname: string): boolean {
  return MIGRATED.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // `/zh/faq` and `/faq` would otherwise serve identical content at two URLs.
  // The prefix-free one is canonical (rule 4), so send readers and crawlers there.
  if (pathname === '/zh' || pathname.startsWith('/zh/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice('/zh'.length) || '/';
    return NextResponse.redirect(url, 308);
  }

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
