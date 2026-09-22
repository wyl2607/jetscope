# Nginx edge policy

This repository keeps two edge configurations:

- `infra/nginx.prod.conf` for the containerized production edge.
- `infra/server/nginx.conf` for the current host-nginx/systemd topology.

Both configurations now share these contracts:

- `Content-Security-Policy-Report-Only` is emitted first so violations can be observed before enforcement.
- Anonymous public HTML may advertise `s-maxage=60, stale-while-revalidate=300`.
- Requests with cookies or authorization, upstream `Set-Cookie` responses, `/api/*`, `/v1/*`, admin pages, and `/_next/image` are `private, no-store`.
- Content-hashed `/_next/static/*` assets remain immutable for one year.
- Admin pages also emit `X-Robots-Tag: noindex, nofollow`; this is not an authentication boundary.

Run the post-deploy check against the actual public origin:

```bash
node scripts/nginx-edge-smoke.mjs https://your-public-host
```

The smoke script checks public HTML CSP/cache headers and non-cacheable API/admin paths without printing response bodies.

## CSP promotion path

Keep the policy report-only through a normal traffic window. Review browser reports and confirm the source map contains every required API, asset, font, and image origin. Then tighten `script-src` and `style-src` (prefer nonces or hashes over `unsafe-inline`), add a real reporting endpoint if needed, and promote the header to `Content-Security-Policy` in a separate reviewed change.

TLS server blocks under `infra/tls/` are operator state. When adding a 443 block, duplicate the same location-level headers and cache exclusions; a separate Nginx `server` block does not inherit headers from the HTTP block.

An HTTP 200 or a merged source PR is not live-edge evidence. Record the deployed commit and run the smoke script against the public hostname after the edge reload.
