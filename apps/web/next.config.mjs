import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Content-Security-Policy-Report-Only (issue #322)
//
// Lives in Next headers() — not only at nginx — so the policy holds whether
// host nginx (today) or the P4 container edge is in front. The two edges are
// in different states; app-level headers do not depend on cutover.
//
// Report-only on purpose. Next.js SSR injects inline bootstrap scripts and
// inline styles; a strict policy therefore reports violations on the app's
// own HTML. That is the measurement step before enforcement, not a bug.
// There is no report-uri / report-to collector: visitor data must not leave
// the site. Violations show in the browser console until a same-origin
// collector is designed as a separate change.
//
// What each directive allows today, and why:
//   default-src 'self'     — fail closed; only same-origin by default
//   base-uri 'self'        — block <base> hijacks
//   object-src 'none'      — no Flash/plugins
//   frame-ancestors 'self' — clickjacking defense (complements X-Frame-Options)
//   form-action 'self'     — forms post only same-origin
//   script-src 'self'      — scripts from this origin only (NO 'unsafe-inline')
//   style-src 'self'       — stylesheets from this origin only (NO 'unsafe-inline')
//   img-src 'self' data: blob: — app images + data/blob URLs used by charts
//   font-src 'self'        — no third-party font CDNs
//   connect-src 'self'     — fetch/XHR only same-origin (/api/* proxies)
//
// Expected console violations today (do not "fix" by weakening first):
//   script-src — Next.js inline bootstrap / hydration scripts
//   style-src  — inline style attributes and any inline <style> tags
//
// Before promoting to Content-Security-Policy (enforcing), in order:
//   1. Move or nonce inline styles (or accept style-src 'unsafe-inline' with a
//      documented residual risk — prefer nonces / CSS modules only).
//   2. Adopt script nonces or 'strict-dynamic' for Next's runtime scripts
//      (framework support / custom Document or nonce plumbing required).
//   3. Confirm connect-src still covers every legitimate same-origin API call
//      and any deliberate third-party endpoint (none today).
//   4. Run a release with Report-Only clean (or only known residual reports)
//      on production traffic, then flip the header name.
//
// Rollback if enforcement breaks the site: rename the header back to
// Content-Security-Policy-Report-Only (or remove it) and redeploy the web
// process / container. No nginx change is required for CSP.
// ---------------------------------------------------------------------------
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'"
].join('; ');

/** @type {import("next").NextConfig} */
const nextConfig = {
  // The container runs `node server.js` out of `.next/standalone`, which carries
  // its own traced `node_modules`. Without this the runtime image would need the
  // whole workspace install. `outputFileTracingRoot` below is what makes the
  // trace reach across the workspace root.
  output: 'standalone',
  typedRoutes: true,
  outputFileTracingRoot: rootDir,
  images: {
    unoptimized: true
  },
  async headers() {
    // Admin is an operational surface. Keep it out of search indexes regardless
    // of which edge (host nginx today, container nginx after P4) sits in front.
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const csp = [{ key: 'Content-Security-Policy-Report-Only', value: cspReportOnly }];
    return [
      { source: '/:path*', headers: csp },
      { source: '/admin', headers: noIndex },
      { source: '/admin/:path*', headers: noIndex },
      { source: '/de/admin', headers: noIndex },
      { source: '/de/admin/:path*', headers: noIndex },
      { source: '/en/admin', headers: noIndex },
      { source: '/en/admin/:path*', headers: noIndex }
    ];
  }
};

export default nextConfig;
