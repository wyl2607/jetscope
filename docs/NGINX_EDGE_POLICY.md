# Nginx edge policy

The host template (`infra/server/nginx.conf`) and container template
(`infra/nginx.prod.conf`) use identical route and bypass maps. The route audit
and current main were checked at `c0d7046daf7367b6bf495b762a7a44b486d854e6`.
Contract tests pin all 42 page routes, 28 web API routes and two metadata routes;
new pages need an audit before joining the allowlist.

## Mechanism and cache lifetime

Nginx owns the downstream cache headers because it can inspect both request
credentials and upstream `Set-Cookie`, status and content type. Next.js
`headers()` cannot make that response-dependent decision. Rendering, fetch
revalidation and browser interactions are unchanged. Neither template enables
nginx `proxy_cache`; the shared cache is the CDN in front of nginx.

Only successful (upstream HTTP 200) anonymous GET/HEAD responses on the exact
allowlist, with HTML, plain-text or XML content, receive:

```http
Cache-Control: public, s-maxage=60, stale-while-revalidate=600
Cloudflare-CDN-Cache-Control: public, max-age=60, stale-while-revalidate=600
```

The first header is the agreed uniform policy, including checked-in articles
and metadata. No browser `max-age` is introduced. The Cloudflare-specific
header uses `max-age` because Cloudflare interprets `s-maxage` as requiring
revalidation, disabling stale serving. Cloudflare consumes its dedicated
header and forwards the ordinary header to clients. See
[Cloudflare stale behavior](https://developers.cloudflare.com/cache/concepts/revalidation/)
and [header precedence](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/).

Sixty seconds is short relative to the default 600-second market refresh loop;
the 600-second stale window is the agreed availability tradeoff. Source delays
and existing read-model caches (often 300 seconds) stack with this window.
This policy is not an end-to-end data freshness guarantee. Manual updates
should trigger a purge when immediate visibility matters.

## Exact audited allowlist

Here “all locales” means the unprefixed route, `/en` and `/de`; it does not
create missing localized pages. No trailing slash or descendant is implicitly
allowlisted.

| Routes | Why anonymous output is public |
| --- | --- |
| `/`, `/en`, `/de` | Public market/reserve/research landing data through `components/home-page.tsx`. |
| `/faq`, `/en/faq`, `/de/faq` | Checked-in localized content through `components/faq-page.tsx`. |
| `/analysis`, `/analysis/lufthansa-flight-cuts-2026-04`, `/analysis/lufthansa-2026-de`, `/en/lufthansa-saf-2026`, `/de/lufthansa-saf-2026` | Checked-in index and `components/lufthansa-case.tsx` article data. |
| `/crisis` in all locales; `/crisis/eu-jet-reserves` | Public market, reserve, event and research data. Incidental workspace fetches do not render saved scenario names or affect these calculations. |
| `/crisis/saf-tipping-point` | Public seed calculation; browser query and token state do not personalize the server render. Full query required. |
| `/grid`, `/heat` | Public parity calculations through the grid/heat read models; sliders stay in browser state. |
| `/research`, `/en/research`, `/de/research` | Public research signals through `components/research-page.tsx`. |
| `/reports/tipping-point-analysis` in all locales | Audited public analysis through `components/tipping-point-report-page.tsx`; no saved scenario output. This is a specific exception, not permission to cache the reports index. |
| `/prices/germany-jet-fuel` in all locales | Public market and URL-specific road-fuel calculations (`diesel_l`, `petrol_l`, `ev_kwh`). Full query required. |
| `/sources`, `/en/sources`, `/de/sources` | Public provenance; URL-specific `focus` and `filter`. Full query required. |
| `/robots.txt`, `/sitemap.xml` | Constant metadata from `app/robots.ts` and `app/sitemap.ts`. |

## Exclusions and variants

Everything else is `private, no-store`. In particular:

- `/admin`, `/en/admin`, `/de/admin` and descendants retain Basic Auth and
  `X-Robots-Tag: noindex, nofollow`. Write APIs retain `x-admin-token`.
- `/dashboard`, `/reports` and `/scenarios` in all locales remain private.
  Saved workspace names/preferences need a public-visibility product decision.
  Unreviewed descendants remain private too, except the audited report above.
- Every `/api` and `/v1` path, including the bare prefixes, remains private.
- Cookie, Authorization or `x-admin-token` values, upstream `Set-Cookie`,
  non-GET/HEAD methods, non-200 responses and non-page content bypass.
- `/_next/image` remains private. Anonymous successful content-hashed
  `/_next/static/*` assets retain a year of immutable caching; credentials,
  Set-Cookie, errors and router variants disable even that asset policy.

Upstream Cache-Control, CDN-Cache-Control, Cloudflare-CDN-Cache-Control and
Surrogate-Control are hidden before nginx emits its policy. This prevents
contradictory headers and prevents an API's upstream public policy from winning.
`Set-Cookie` is forwarded, never stripped to make a response cacheable.
Security headers remain present in every location.

For this rollout, all requests carrying RSC, Next-Router-State-Tree,
Next-Router-Prefetch, Next-Router-Segment-Prefetch or Next-Url, or a literal
`_rsc` query parameter, bypass caching. `text/x-component` responses are never
promoted to public. HTML keeps the upstream `Vary` values and adds all five
Next.js variant headers. This avoids needing a custom RSC cache key in the
initial rollout. See [Next.js CDN requirements](https://nextjs.org/docs/app/guides/cdn-caching).

`$uri` is used only to classify a route. The proxy forwards the complete
original query string. The CDN must key HTML on the complete URL, including
all query parameters, their values and repeated parameters; do not ignore,
whitelist, drop or normalize query parameters. Apply this to every allowed
page, especially price, source and tipping-point pages. Local origin tests
cannot prove a deployed CDN's cache-key configuration.

## Required CDN configuration before enabling page caching

Origin bypass headers alone cannot protect a previously cached HIT. The
operator must apply these rules at the CDN **before cache lookup**:

1. Restrict cache eligibility to the exact allowlist above and GET/HEAD. Keep
   private paths outside any broader “Cache Everything” rule.
2. Bypass requests containing Cookie, Authorization or `x-admin-token`, even
   empty header values, and all five Next variant headers or `_rsc` query
   requests. Forward these headers unchanged. Ensure the bypass takes priority
   over any eligibility rule. Nginx variables detect nonempty header values;
   header-presence enforcement, including empty values, belongs at the CDN.
3. Include the full query string in the HTML cache key. Respect origin TTLs
   and no-store/Set-Cookie; enable stale serving and disable Always Online for
   this policy. Do not override origin cache-control with Cache Response Rules.
4. Preserve `Vary`. Keep RSC caching disabled until a separately reviewed
   configuration keys every variant and verifies both warmup orders.

No Cloudflare settings are changed by this source patch. Disable any existing
broad page-cache rule, configure the restrictions, deploy the reviewed templates,
and purge old objects before enabling the new allowlist. Reloading nginx alone
neither updates CDN rules nor purges cached responses.

## Purge and verification

After an authorized deployment or manual public-data update, use the Cloudflare
zone's **Caching → Configuration → Purge Cache** controls. For a narrow content
change, purge each affected full URL, including locale and query variants.
For a policy change, removed route, privacy fix, or unknown query variants, use
**Purge Everything** to remove old entries. No nginx cache directory needs
clearing. See [Cloudflare purge instructions](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-everything/).

Run against the approved public hostname after configuring/reloading the edge:

```bash
node scripts/nginx-edge-smoke.mjs https://your-public-host
```

The script runs curl checks without printing bodies or credentials. It covers
all safe routes, exclusions, bare API prefixes, Basic Auth, two synthetic
sessions after HTML warmup, token/auth bypass, RSC in both warmup orders, HEAD,
POST and query variants. It rejects duplicate/conflicting cache headers and
cached HIT/STALE/UPDATING/REVALIDATED responses on bypass requests. RSC redirects
are inspected without following them. The script does not force a CDN HIT or
simulate an upstream Set-Cookie response; those need the following manual checks.

Record the deployed SHA and validate the actual host configuration with
`nginx -t` before reload. Check repeat anonymous HTML becomes HIT, then verify
authenticated requests cannot retrieve that HIT. Compare price/source response
bodies for distinct query inputs in both warmup orders, not just their headers.
Use a controlled non-production upstream to verify Set-Cookie/error responses
remain private and never populate a shared cache. Verify stale responses after
expiry and access-log reduction. An HTTP 200 or merged PR is not live-edge proof.

TLS blocks under `infra/tls/` are operator state: separate server blocks must
carry the same exclusions, Basic Auth and location-level security headers.

## CSP promotion path

Keep CSP report-only through a normal traffic window. Review browser reports,
confirm API/asset/font/image origins, then tighten script/style sources and add
a reporting endpoint before promoting to enforcement in a separate change.
