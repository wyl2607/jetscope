# Nginx edge policy

This repository keeps two edge configurations:

- `infra/nginx.prod.conf` for the containerized production edge.
- `infra/server/nginx.conf` for the current host-nginx/systemd topology.

Both configurations now share these contracts:

- `Content-Security-Policy-Report-Only` is emitted first so violations can be observed before enforcement.
- Anonymous public HTML may advertise `s-maxage=60, stale-while-revalidate=300`.
- Requests with cookies or authorization, upstream `Set-Cookie` responses, `/api/*`, `/v1/*`, admin pages, and `/_next/image` are `private, no-store`.
- Content-hashed `/_next/static/*` assets remain immutable for one year.
- Admin pages (`/admin`, `/en/admin`, `/de/admin`, including subpaths) require edge Basic Auth via `auth_basic` and `auth_basic_user_file` on `location ~ ^/(?:en/|de/)?admin(?:/|$)`. The htpasswd file is operator state and is not in this repository. Those locations also emit `X-Robots-Tag: noindex, nofollow`. Write APIs keep `x-admin-token` as a second layer.
- `/api/readiness` (Next.js proxy) and `/v1/readiness` (direct API proxy), including trailing slashes, require the same Basic Auth realm and htpasswd file as admin. Both emit `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`, including on 401 responses. Keep the readiness regex before the generic `/api` regex. `/api/v1/readiness` is not routed by either config or Next.js; if an alias is introduced, it must receive the same gate.

## Readiness consumers and credentials

| Consumer | Route | Edge impact |
| --- | --- | --- |
| Web server-side readiness read model and `/api/readiness` proxy | `http://api:8000/v1/readiness` in Compose | Direct internal API fetch; no Basic Auth required |
| `scripts/auto-deploy.sh`, `scripts/rollback.sh`, `infra/server/health-check.sh` | `http://127.0.0.1:8000/v1/readiness` by default | Local deep-readiness checks remain intact; keep overrides on the internal API |
| Public smoke workflow, product smoke and uptime checks | `/v1/health` or `/api/health` | Public liveness remains available; public monitors must use health |
| Edge smoke | Anonymous admin and both readiness paths | Must return 401 with `WWW-Authenticate: Basic` |

Before enabling the gate, the operator creates an htpasswd file outside the checkout at `/etc/nginx/secrets/jetscope-admin.htpasswd`, using an interactive `htpasswd -cB` prompt for the first user. Additional users and password rotation use `htpasswd -B` without `-c`; never pass a password on the command line. Keep the file and its hashes out of Git and logs. The host nginx worker needs directory traversal and file read permission. A missing or unreadable file fails authenticated requests; `nginx -t` alone does not prove it is readable.

Compose mounts that host file read-only at `/etc/nginx/secrets/admin.htpasswd`. Verify the container worker can read it, including its numeric UID/GID permissions. After rotation, recreate the nginx container to refresh the file bind mount if the file's inode was replaced. See [host provisioning and rotation](DEPLOY_USA_VPS.md#admin-and-readiness-edge-gate-host-nginx) and [container provisioning and rotation](DEPLOY_WEB_VPS.md#operator-credentials-before-starting-the-container-edge).

Run the post-deploy check against the actual public origin:

```bash
node scripts/nginx-edge-smoke.mjs https://your-public-host
```

The smoke script checks public HTML CSP/cache headers, public health availability, and private/no-store API/admin paths without printing response bodies. Every anonymous admin and readiness request must return 401 with a Basic challenge and noindex/nofollow; redirects and public 200 responses fail.

## CSP promotion path

Keep the policy report-only through a normal traffic window. Review browser reports and confirm the source map contains every required API, asset, font, and image origin. Then tighten `script-src` and `style-src` (prefer nonces or hashes over `unsafe-inline`), add a real reporting endpoint if needed, and promote the header to `Content-Security-Policy` in a separate reviewed change.

TLS server blocks under `infra/tls/` are operator state. When adding a 443 block, duplicate the same location-level headers, cache exclusions, and admin/readiness Basic Auth directives; a separate Nginx `server` block does not inherit them from the HTTP block.

An HTTP 200 or a merged source PR is not live-edge evidence. Record the deployed commit and run the smoke script against the public hostname after the edge reload.
