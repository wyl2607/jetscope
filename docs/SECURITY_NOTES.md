# Security Notes

## Content-Security-Policy (report-only)

The web app sends `Content-Security-Policy-Report-Only` from
`apps/web/next.config.mjs` `headers()`. It is **not** enforcing. There is no
`report-uri` / `report-to` collector — violations appear in the browser
console only, so visitor data never leaves the site.

### What the policy allows (and why)

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Fail closed |
| `base-uri` | `'self'` | Block `<base>` hijacks |
| `object-src` | `'none'` | No plugins |
| `frame-ancestors` | `'self'` | Clickjacking defense (with `X-Frame-Options`) |
| `form-action` | `'self'` | Forms stay same-origin |
| `script-src` | `'self'` | No third-party scripts; **no** `'unsafe-inline'` |
| `style-src` | `'self'` | No third-party styles; **no** `'unsafe-inline'` |
| `img-src` | `'self' data: blob:` | App assets plus chart data/blob URLs |
| `font-src` | `'self'` | No font CDNs |
| `connect-src` | `'self'` | Same-origin `/api/*` only |

### Expected violations today

Next.js SSR injects inline bootstrap scripts and often inline styles. With the
strict `script-src` / `style-src` above, the browser will report those against
the app's own HTML. That is the measurement phase; do not "fix" it by
weakening the policy until the promotion steps below are done.

### Promotion path to enforcing `Content-Security-Policy`

1. Eliminate or nonce inline styles (prefer CSS modules / static classes).
2. Adopt script nonces or `'strict-dynamic'` for Next runtime scripts (needs
   framework nonce plumbing — do not flip the header name first).
3. Confirm `connect-src` still matches every legitimate same-origin call (and
   any deliberate third party, of which there are none today).
4. Run production traffic under Report-Only until the console is clean (or only
   known residual reports remain), then rename the header to
   `Content-Security-Policy` in `next.config.mjs`.

### Rollback

Rename back to `Content-Security-Policy-Report-Only` (or remove the header)
and redeploy the web process. CSP is app-level; nginx does not need a change
for CSP rollback.

A same-origin report collector is a deliberate follow-up if operators want
aggregated reports without shipping data to a third party.

## Current npm advisory

- Advisory: `GHSA-qx2v-qp2m-jg93`
- Package: `postcss <8.5.10`
- Severity: moderate
- Current path: `next@16.2.11 -> postcss@8.4.31`

`npm audit fix` cannot currently remediate this without forcing `next@9.3.3`, which is a breaking downgrade and is not a valid fix for this Next.js 16 application. The project already pins the direct PostCSS dependency used by Tailwind/autoprefixer to `8.5.22`; the remaining advisory is inside Next's published dependency graph.

Mitigation until Next publishes a patched dependency:

- Keep direct `postcss` pinned to `8.5.22`.
- Keep CI on `npm run audit:security`, which fails on high or critical advisories while this moderate transitive false-actionable advisory remains open.
- Keep Dependabot enabled for npm, pip, and GitHub Actions so the repository receives a PR when a patched Next.js release is available.
- Re-run `npm audit` after each Next.js upgrade and remove this note once `next` no longer vendors `postcss <8.5.10`.

## Python dependency audit

CI runs `npm run audit:python`, which delegates to `python -m pip_audit -r apps/api/requirements.txt` after API dependencies are installed.

The API dependency set intentionally pins patched versions for currently known transitive advisories:

- `fastapi==0.121.0` with explicit `starlette==0.49.1` to avoid Starlette advisories affecting older `0.41.x` releases.
- `pdfplumber==0.11.9` to pull `pdfminer.six==20251230`, which remediates the known `pdfminer-six` advisories affecting `20231228`.
