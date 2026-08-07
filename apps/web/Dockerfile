# The web frontend. Build context is the REPOSITORY ROOT, not apps/web:
#
#   docker build -f apps/web/Dockerfile -t jetscope-web .
#
# npm workspaces keep the lockfile and the hoisted node_modules at the root, and
# `packages/core` is reached through a tsconfig path alias rather than as a
# workspace dependency, so a context rooted at apps/web cannot see either.

# ---------------------------------------------------------------------------
# deps - install once, cached on the lockfile alone
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Only the manifests, so a source-only change does not invalidate the install
# layer. `npm ci` needs every workspace manifest the lockfile mentions.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

# ---------------------------------------------------------------------------
# build - produce .next/standalone
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The gate (tests, design lint, figure lint) belongs in CI. Running it here
# would make every deploy as slow and as flaky as the whole test suite, and a
# deploy that fails on a lint rule leaves the site down for a reason unrelated
# to the site.
RUN npm --prefix apps/web run build

# In a workspace the standalone tree preserves the workspace shape: the server
# entrypoint lands at apps/web/server.js and the traced node_modules sits at the
# standalone root. Fail loudly here rather than shipping an image that exits
# instantly on start.
RUN test -f apps/web/.next/standalone/apps/web/server.js \
  || (echo "standalone build missing apps/web/server.js - is output:'standalone' still set in next.config.mjs?" && exit 1)

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Without this the standalone server binds to localhost inside the container and
# nginx on the compose network cannot reach it. This is the single most common
# cause of a container that is "up" and unreachable.
ENV HOSTNAME=0.0.0.0

# node:alpine ships a non-root `node` user (uid 1000). Own the tree with it so
# the process never runs as root.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node

EXPOSE 3000

# No HEALTHCHECK here on purpose: a 200 from this server proves only that Next
# is running. It returns 200 with every read model on its fallback when the API
# is unreachable. The deploy verification asserts on rendered content instead -
# see docs/DEPLOY_WEB_VPS.md section 6.

CMD ["node", "apps/web/server.js"]
