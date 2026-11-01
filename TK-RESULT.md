# TK-003A result — usa nginx templates

Scope: templates only. No smoke script (that is TK-003B), no remote access, no
git commit. Baseline:
`.governance/sprints-001-oci-a1-primary-hosting/metrics/baseline/usa-sites-enabled-jetscope.conf`
(usa nginx 1.24.0, `sites-enabled/jetscope`).

## Changed files

| File | Purpose |
| --- | --- |
| `infra/server/oci-a1/nginx/jetscope-upstream.conf` | http-level upstreams (oci primary + usa backup), read/write upstream maps, `$jetscope_served_by`. |
| `infra/server/oci-a1/nginx/jetscope-site.conf` | Rewrite of the baseline site file: variable `proxy_pass` without URI, `/admin` pinned to `jetscope_web_rw`, served-by header. |
| `infra/server/oci-a1/nginx/jetscope-maintenance.conf` | Optional include that returns 503 + `Retry-After: 120` for non-GET/HEAD/OPTIONS. |
| `infra/server/oci-a1/nginx/README.md` | Install paths, placeholder replacement, rollback. |

## Validation

### `ls infra/server/oci-a1/nginx/`

```text
README.md
jetscope-maintenance.conf
jetscope-site.conf
jetscope-upstream.conf
```

### `grep -nE 'proxy_pass' infra/server/oci-a1/nginx/*.conf`

```text
infra/server/oci-a1/nginx/jetscope-site.conf:36:        proxy_pass http://$jetscope_api_up;
infra/server/oci-a1/nginx/jetscope-site.conf:59:        proxy_pass http://jetscope_web_rw;
infra/server/oci-a1/nginx/jetscope-site.conf:82:        proxy_pass http://$jetscope_web_up;
infra/server/oci-a1/nginx/jetscope-site.conf:98:        proxy_pass http://$jetscope_web_up;
```

Every line is `proxy_pass http://<upstream name or $variable>;` with no path or
query, so the original request URI and query string are forwarded unchanged
(review A1).

### `diff <(grep -vE '^\s*#' baseline) <(grep -vE '^\s*#' site.conf)`

```diff
31a32,33
>     include /etc/nginx/snippets/jetscope-maintenance*.conf;
>
33c35
<         proxy_pass http://127.0.0.1:8000/v1/;
---
>         proxy_pass http://$jetscope_api_up;
34a37
>         proxy_set_header Connection "";
42a46,52
>         add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
>         add_header X-Content-Type-Options "nosniff" always;
>         add_header X-Frame-Options "SAMEORIGIN" always;
>         add_header Referrer-Policy "strict-origin-when-cross-origin" always;
>         add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
>         add_header Content-Security-Policy-Report-Only "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; worker-src 'self' blob:;" always;
>         add_header X-JetScope-Served-By $jetscope_served_by always;
48c58
<         proxy_pass http://127.0.0.1:3000;
---
>         proxy_pass http://jetscope_web_rw;
49a60
>         proxy_set_header Connection "";
65a77
>         add_header X-JetScope-Served-By $jetscope_served_by always;
69c81
<         proxy_pass http://127.0.0.1:3000;
---
>         proxy_pass http://$jetscope_web_up;
70a83
>         proxy_set_header Connection "";
78a92
>         add_header X-JetScope-Served-By $jetscope_served_by always;
83c97
<         proxy_pass http://127.0.0.1:3000;
---
>         proxy_pass http://$jetscope_web_up;
84a99
>         proxy_set_header Connection "";
93a109,115
>         add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
>         add_header X-Content-Type-Options "nosniff" always;
>         add_header X-Frame-Options "SAMEORIGIN" always;
>         add_header Referrer-Policy "strict-origin-when-cross-origin" always;
>         add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
>         add_header Content-Security-Policy-Report-Only "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; worker-src 'self' blob:;" always;
>         add_header X-JetScope-Served-By $jetscope_served_by always;
```

## Why each hunk exists

1. **`include ...jetscope-maintenance*.conf;` (server level, new)** — the
   cutover gate. A glob include with no match is not an error, so the site file
   is installable before the snippet exists; deleting the snippet lifts the
   gate. The snippet itself is in the server context so its `if` runs before
   location matching.
2. **`/v1/`: `:8000/v1/` → `$jetscope_api_up`** — the only baseline location
   that carried a URI. For a prefix location, the baseline appended the
   remainder after `/v1/` onto `/v1/`, i.e. it reconstructed the original path;
   the variable form forwards the original normalized URI and query unchanged.
   Equivalent, and it now selects read vs write upstream by method.
3. **`/admin`: `127.0.0.1:3000` → `jetscope_web_rw`** — no URI in either form
   (baseline already preserved the full URI); pinning the static name enforces
   that admin never falls back to usa.
4. **`/_next/static/` and `/`: `127.0.0.1:3000` → `$jetscope_web_up`** — no URI
   in either form; read methods use oci with usa backup, writes use the
   oci-only upstream.
5. **`proxy_set_header Connection "";` in all four locations** — required for
   upstream keepalive (`proxy_http_version 1.1` was already present).
6. **`add_header X-JetScope-Served-By ...` in all four locations** — origin
   marker from `$jetscope_served_by`.
7. **Duplicated six security headers in `/v1/` and `/`** — baseline locations
   had no `add_header`, so they inherited the server-level set. nginx stops
   inheriting `add_header` as soon as a location defines one, so adding
   served-by there would have silently dropped HSTS / nosniff / XFO /
   Referrer / Permissions / CSP. The six headers are repeated verbatim to keep
   the response headers identical apart from the new one. `/_next/static/` and
   `/admin` already had their own sets, so only served-by is appended (and
   `/_next/static/` still deliberately has no CSP, matching the baseline).

Unchanged: HTTP→HTTPS redirect, TLS/cert paths, `server_tokens`, `limit_req
zone=saf_req burst=100 nodelay`, `limit_conn saf_conn 32`, `auth_basic` on
admin, `proxy_hide_header X-Powered-By`, timeouts, buffering, access logs,
real-ip/Cloudflare setup references. No `map`, `upstream` or new feature beyond
the RFC.

## Upstream file notes

- `jetscope_api` / `jetscope_web`: `__OCI_IP__:PORT max_fails=2
  fail_timeout=30s`, `127.0.0.1:PORT backup`, `keepalive 8`.
- `jetscope_api_rw` / `jetscope_web_rw`: single `__OCI_IP__:PORT` server, no
  backup, `keepalive 8`. A write during an oci outage therefore returns 502
  instead of silently hitting usa.
- `map $request_method`: GET/HEAD/OPTIONS → read upstream, everything else
  (including POST/PUT/PATCH/DELETE) → `_rw`, for both api and web.
- `map $upstream_addr $jetscope_served_by`: `$upstream_addr` is a comma list
  when a request was retried, and the last entry is the one that served it.
  The regex is end-anchored (`"~__OCI_IP_RE__:[0-9]+$"`) instead of
  start-anchored, so `oci, usa` reports `usa`, not `oci-a1`; a clean oci hit
  reports `oci-a1`.

Additional local checks: brace balance 0 for all three `.conf` files, no tabs,
and the documented `sed` command was dry-run over the template:

```text
    server 100.81.227.79:8000 max_fails=2 fail_timeout=30s;
    server 100.81.227.79:3000 max_fails=2 fail_timeout=30s;
    server 100.81.227.79:8000 max_fails=2 fail_timeout=30s;
    server 100.81.227.79:3000 max_fails=2 fail_timeout=30s;
    "~100\.81\.227\.79:[0-9]+$" oci-a1;
```

## Done criteria (TK-003A portion)

- [x] `jetscope-upstream.conf`: 4 upstreams, `map $request_method` (api/web),
      `map $upstream_addr $jetscope_served_by`.
- [x] `jetscope-site.conf`: rewritten from the baseline (fetched read-only by
      the Coordinator beforehand), every `proxy_pass` URI-less, `/admin` on
      `jetscope_web_rw`, served-by header, diff recorded above.
- [x] `jetscope-maintenance.conf`: non-GET/HEAD/OPTIONS → 503 + `Retry-After:
      120`.
- [x] `README.md`: install location, placeholder replacement, rollback.
- [ ] `nginx -t`: not run here — this machine has neither `nginx` nor `docker`
      (checked). Static checks only; parse-level validation and behavior
      assertions belong to TK-003B's containerized smoke.
- [ ] `nginx-smoke.sh`: out of scope for TK-003A (TK-003B).

## Residual risks

- Template syntax has not been parsed by nginx on this machine. The risky
  constructs are standard (`map` regex key, variable `proxy_pass` to upstream
  names, server-context `if` + `return`, optional glob include) and are
  exercised by TK-003B, but no `nginx -t` evidence exists yet.
- `add_header` is not inherited once a location defines it. The six security
  headers are duplicated in `/v1/` and `/`; if the server-level set changes
  later, those two copies must be updated too.
- `Retry-After` is set with a server-level `add_header` inside the maintenance
  snippet. It therefore lands on server-generated 503s (the intended case) but
  not on proxied responses from locations that define their own `add_header`;
  that asymmetry is intentional and inert outside a cutover.
- `X-JetScope-Served-By` on a 401 (auth_basic) or a server-generated 503 has
  no upstream, so `$upstream_addr` is empty and the header says `usa`. RFC only
  requires the marker on proxied responses.
- `max_fails`/`fail_timeout`/`keepalive` on the `_rw` upstreams are explicit
  for consistency with the read upstreams; the RFC only fixed the server list
  (oci only, no backup).
- Install order matters: `conf.d/jetscope-upstream.conf` must be in place
  before the site file is reloaded, otherwise the maps/upstreams are unknown.
