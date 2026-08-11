# Deploying the web frontend to the VPS (P4)

> **Correction, 2026-08-07.** The two paragraphs that used to open this document
> said production ran the API container alone and the frontend was not
> reachable. **That was false.** `https://saf.meichen.beauty/` answers 200 and
> has for some time; `docs/DEPLOY_USA_VPS.md` recorded the real topology and
> this file contradicted it. The frontend runs under **systemd**
> (`jetscope-web.service`, `127.0.0.1:3000`) behind **host** nginx.
>
> Two documents disagreeing about whether the product is live is worse than
> either being wrong alone, so: `docs/DEPLOY_USA_VPS.md` is authoritative for
> what is running. This file is the plan for moving the frontend into a
> container, which has not happened.
>
> The live site was also serving a build older than the P1.5 page-template work,
> because `scripts/deploy-usa-vps.sh --rebuild` only ever rebuilt the API
> container — it never rebuilt the Next app or restarted the systemd unit, so
> every deploy reported success while the public site stood still. Fixed; the
> script now does both, and the smoke check asserts on rendered content.

`docs/DEPLOY_USA_VPS.md` covers what production actually runs today. This
document covers containerising the frontend: a standalone Next build, a
production nginx in front of both services, and the cutover.

Phase P4 in `docs/UI_CONTRACT.md` is about the frontend being reachable over
the public internet. It is — just not from a container.

## Cutover, and why it is not a flag on a routine deploy

Everything below is built and locally verified, and **none of it is started by
`scripts/deploy-usa-vps.sh`**. The `web` service wants `127.0.0.1:3000`, which
`jetscope-web.service` holds. The `nginx` service wants `:80` and `:443`, which
host nginx holds. Starting them on the live host today does not add a frontend;
it fails to bind, and in the worst ordering it takes the working one down.

Cutting over is its own operation and needs, in order:

1. `systemctl stop jetscope-web.service && systemctl disable jetscope-web.service`
2. Stop host nginx, or move it off `:80`/`:443`.
3. Mount the existing certificates into the nginx container and add a `443`
   server block under `infra/tls/` — see the README there. Until that exists,
   the containerised edge is HTTP-only, which is a downgrade from what is
   running now.
4. `docker compose -f docker-compose.prod.yml up -d --build api web nginx`
5. Verify on rendered content, not status codes, exactly as the deploy script's
   smoke step does.

Rollback is the reverse: stop the two containers, re-enable and start
`jetscope-web.service`, start host nginx. Keep that path rehearsed rather than
discovered.

## The failure this deployment can produce silently

Read this before writing any of it.

`apps/web/lib/api-config.ts` resolves the API base like this:

```ts
const DEFAULT_LOCAL_API_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '';
export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.JETSCOPE_API_BASE_URL ?? process.env.SAFVSOIL_API_BASE_URL ?? DEFAULT_LOCAL_API_BASE_URL
);
```

An empty base is correct for a browser calling a same-origin nginx. It is wrong
for a server component, which has no origin to be relative to. Every page in
this app sets `dynamic = 'force-dynamic'` and fetches on the server.

So if the web container starts without `JETSCOPE_API_BASE_URL`, every server-side
fetch fails, every read model returns its fallback, and the site renders. It
renders invented numbers, with the pages reporting them as assumptions in small
print, and nothing crashes. A smoke test that only checks for HTTP 200 passes.

**The web container must set `JETSCOPE_API_BASE_URL=http://api:8000`**, and the
deploy verification below must assert on a real value rather than on a status
code.

## What is missing

Everything in this table has landed. The sections below are kept as the
reference for why each piece is shaped the way it is.

| Item | State |
| --- | --- |
| `apps/web/Dockerfile` | landed — three stages, build context is the repo root |
| `output: 'standalone'` in `apps/web/next.config.mjs` | set |
| `.dockerignore` | landed at the repo root |
| `web` service in `docker-compose.prod.yml` | landed, with `JETSCOPE_API_BASE_URL=http://api:8000` |
| `nginx` service in `docker-compose.prod.yml` | landed |
| production nginx config | `infra/nginx.prod.conf`, TLS blocks left to the operator in `infra/tls/` |
| security headers + edge cache | same five headers and Cache-Control policy as host nginx (`infra/server/nginx.conf`); every `add_header` location restates the full set (nginx does not merge). See `docs/DEPLOY_USA_VPS.md` "Public-page edge cache" |
| `scripts/deploy-usa-vps.sh` | brings up `api web nginx`, and verifies the rendered page |

**The one thing left is running it against the host**, from an environment that
has `rsync`:

```bash
bash scripts/deploy-usa-vps.sh --rebuild
```

Two defects were found in the existing deploy script while wiring this up, both
of which would have shown up at the worst moment:

- The script could not parse at all. `rev-parse --verify HEAD^{commit}"` had a
  quote on the wrong side of the revision, which opens a string that swallows
  the rest of the `if`. `bash -n scripts/deploy-usa-vps.sh` rejected the whole
  file. `test/shell-script-syntax.test.mjs` now parses every tracked `*.sh` so
  this class cannot come back.
- In the legacy `docker-compose` branch, the stale-container cleanup loop read
  `"$container_id"` inside an **unquoted** heredoc, so the variable expanded on
  the deploying machine to an empty string before the script ever reached the
  host. The loop had never removed a container. The references are escaped now.

## 1. Next config

Add `output: 'standalone'`. `outputFileTracingRoot` is already pointed at the
monorepo root, which standalone tracing needs in a workspace layout.

```js
const nextConfig = {
  output: 'standalone',
  typedRoutes: true,
  outputFileTracingRoot: rootDir,
  images: { unoptimized: true }
};
```

Verify locally before containerising: `npm run web:build`, then confirm
`apps/web/.next/standalone/apps/web/server.js` exists. In a workspace the
standalone tree keeps the workspace shape, so the server entrypoint is nested
under `apps/web/` and the traced `node_modules` sits at the standalone root.
Getting this path wrong is the usual cause of a container that exits instantly.

## 2. `apps/web/Dockerfile`

Build context is the **repository root**, not `apps/web` — npm workspaces means
the lockfile and the hoisted `node_modules` live at the root.

Three stages:

1. **deps** — copy `package.json`, `package-lock.json`, `apps/web/package.json`,
   `packages/*/package.json`; run `npm ci`.
2. **build** — copy the source, run `npm --prefix apps/web run build`. Note that
   `npm run web:gate` is not appropriate here; the gate belongs in CI, and a
   container build that runs the test suite makes deploys slow and flaky.
3. **runtime** — `node:22-alpine`, non-root user, copy
   `apps/web/.next/standalone`, `apps/web/.next/static` and `apps/web/public`
   if present. `CMD ["node", "apps/web/server.js"]`, `EXPOSE 3000`.

Set `ENV NODE_ENV=production` and `ENV HOSTNAME=0.0.0.0` in the runtime stage —
the standalone server binds to localhost inside the container otherwise, and
nginx cannot reach it.

Add a `.dockerignore` at the repo root covering `node_modules`, `.next`, `dist`,
`data`, `.git`, and `apps/api/.venv`, or the build context will be enormous.

## 3. `docker-compose.prod.yml`

Add two services alongside `api`.

```yaml
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: jetscope-web
    restart: unless-stopped
    init: true
    depends_on:
      - api
    environment:
      NODE_ENV: production
      JETSCOPE_API_BASE_URL: http://api:8000
      JETSCOPE_API_PREFIX: /v1
    ports:
      - "127.0.0.1:3000:3000"

  nginx:
    image: nginx:1.27-alpine
    container_name: jetscope-nginx
    restart: unless-stopped
    depends_on:
      - web
      - api
    volumes:
      - ./infra/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "80:80"
      - "443:443"
```

Keep `api` bound to `127.0.0.1:8000` as it is now: nginx reaches it over the
compose network, and it should not be publicly exposed directly.

Give `web` the same `mem_limit` / `cpus` treatment the `api` service already
has, so one container cannot starve the other on a small VPS.

## 4. `infra/nginx.prod.conf`

A new file. The existing `infra/nginx.conf` and `infra/app.conf` serve the dev
compose and should not be reused.

- `location /v1/` proxies to `http://api:8000`
- `location /` proxies to `http://web:3000`
- Admin paths (`/admin`, `/de/admin`, `/en/admin`) use edge Basic Auth via
  `auth_basic` + `auth_basic_user_file /etc/nginx/secrets/admin.htpasswd`
  (credential file is operator state; mount it, never bake it into the image).
  Application write routes keep `x-admin-token` as a second layer. The live
  host-nginx equivalent and operator steps live in `docs/DEPLOY_USA_VPS.md`.
- forward `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`
- `proxy_read_timeout` above the app's own fetch timeouts, which default to a
  few seconds via `JETSCOPE_*_FETCH_TIMEOUT_MS`
- TLS: terminate here. Certificates are operator state and do not belong in the
  repository; reference them by path and document the path in the operator's own
  notes, not here.

Order matters: `/v1/` must be declared before `/`, or the catch-all swallows API
traffic and the browser silently gets HTML where it expected JSON. Admin auth
locations must also sit before the catch-all `/`.

## 5. `scripts/deploy-usa-vps.sh`

Around line 85 the script runs `docker compose -f docker-compose.prod.yml up -d
--build api` in the compose v2 branch, and the same list again in the legacy
`docker-compose` branch. Both need `api web nginx`.

The legacy branch also force-removes containers matched by
`label=com.docker.compose.service=api` and by the name `jetscope-api`. Extend
that to the new services, or a stale `jetscope-web` survives a redeploy and
serves the previous build.

Deployment runs from an environment that has `rsync`. Git Bash on Windows does
not; run it from WSL there.

## 6. Verification, in order

Local, before deploying:

```bash
npm run web:build
docker build -f apps/web/Dockerfile -t jetscope-web:test .
docker run --rm -p 3000:3000 -e JETSCOPE_API_BASE_URL=http://host.docker.internal:8000 jetscope-web:test
```

On the host, after deploying:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3000/ > /dev/null && echo "web up"
curl -fsS http://127.0.0.1:8000/v1/health && echo "api up"
curl -fsS https://<public-host>/v1/health && echo "proxy up"
```

Then the check that actually matters, from the public URL:

```bash
curl -fsS https://<public-host>/sources | grep -q "实测" && echo "server-side API reachable"
```

A page whose sources all read as assumptions means the web container is not
talking to the API, whatever the status codes say. Prefer asserting on the
timestamp block: a page that renders a real `data as of` stamp has, by
construction, reached a read model that returned observed data.

Add this as a step in `scripts/preflight-product-smoke.mjs` or as a small
post-deploy script, so it is not a thing a human remembers to do.

## 7. Rollback

`.deploy-commit` is already written on the host by the deploy script. Roll back
by checking out that commit and re-running the deploy, or by
`docker compose -f docker-compose.prod.yml up -d --no-build web` against the
previously built image if it is still present. Confirm the rollback the same way
as the deploy: on the rendered page, not on the status code.

## Sequencing

Steps 1 and 2 are independent of the rest and can be verified locally without
touching the host. Steps 3 to 5 are one change and should land together — a
compose file that references a missing nginx config leaves the site down. Step 6
should land in the same PR as steps 3 to 5, because a deploy path without a
verification step is how the fallback failure above survives.
