# Project state — the frontend program

Where the UI refactor stands, how the work is delegated, and what comes next.
Written to be readable by a person or an AI agent arriving with no prior
context. `docs/UI_CONTRACT.md` is the rules; this file is the position.

Last updated against `main` at the merge of PR #301.

## What the program is for

Three requirements drove it:

1. **Professional** — one visual system instead of nine accumulated ones.
2. **Consistent** — the same page skeleton everywhere, so a reader who has seen
   one page has seen them all.
3. **Every part means something** — each block on a page earns its place by
   helping answer that page's decision question, and every number on screen can
   say where it came from.

The first is P0 and P1. The second is P1.5. The third is P1.5 at the page level
and P3 at the number level.

## Position

| Phase | Scope | State |
| --- | --- | --- |
| **P0** | tokens, ratchet gate, single navigation source | done |
| **P1** | palette migration | **done — 0 violations, compatibility layer deleted** (#316) |
| **P1.5** | page template on every page | **done — 42 of 42** |
| **P2** | collapse `/`, `/de`, `/en` into `/[locale]` | about 10 percent, only `navigation.ts` — and larger than it looks, see below |
| **P3** | `Figure` contract through the read models | **done — 0 violations** (#314) |
| **P4** | web container and nginx on the VPS | see the correction below — the site is live, but not from a container |

Both ratchets only turn one way and both run in `npm run web:gate`:

- `scripts/design-system-lint.mjs` with `scripts/design-system-baseline.json`
- `scripts/figure-contract-lint.mjs` with `scripts/figure-contract-baseline.json`

A file absent from a baseline must be clean. A file in one may never get worse.
A file that improves must have its baseline lowered with `--update`, so the gain
is locked in.

## What to do next, in order

1. **Ship the current build.** This file and `docs/DEPLOY_WEB_VPS.md` both used
   to say the frontend was not deployed. **That was wrong**, and it was wrong in
   the direction that hides work: `https://saf.meichen.beauty/` has been
   answering 200 the whole time, and `docs/DEPLOY_USA_VPS.md` said so.

   What is actually true, measured 2026-08-07:

   | | |
   | --- | --- |
   | the site | live and public |
   | the frontend process | **systemd**, `jetscope-web.service` on `127.0.0.1:3000` — not a container |
   | the edge | **host** nginx on `:80`/`:443`, named vhost |
   | the build being served | `4cc37d22`, deployed 2026-08-08 — P1.5 and P3 are live |

   That deploy closed the gap this entry was written about: the 42 pages on one
   template, the decision questions and the honest timestamps are on the
   internet. **P1 (#316) is not** — the palette work landed after it, so the
   public site is one phase behind `main` again. Deploying is one command from
   an environment with `rsync` (WSL, not Git Bash):

   ```bash
   bash scripts/deploy-usa-vps.sh --rebuild
   ```

   That now rebuilds the API container *and* rebuilds the Next app and restarts
   the systemd unit. It previously touched only the container, which is how the
   public site drifted a whole phase behind `main` while every deploy reported
   success.

   The post-deploy check asserts on rendered content rather than on a status
   code, because the characteristic failure here is a site that serves 200 on
   every route while every read model sits on its fallback. `/sources` emits
   `data-testid="page-as-of"` only when the server-side fetch actually reached
   the API, so that stamp is the proof — checked on `:3000` and again through
   nginx with the public `Host` header.

2. **P4 proper, the containerisation.** `apps/web/Dockerfile`,
   `output: 'standalone'`, the `web` and `nginx` services in
   `docker-compose.prod.yml`, and `infra/nginx.prod.conf` are all in and
   locally verified. **They are deliberately not started by the deploy script**:
   `web` wants `:3000` and `nginx` wants `:80`/`:443`, all three of which are
   held by the systemd unit and host nginx. Starting them today takes the site
   down. Cutting over means stopping and disabling `jetscope-web.service`,
   stopping host nginx, and mounting the existing certificates into the nginx
   container — a deliberate operation with a rollback path, not a flag on a
   routine deploy. See `docs/DEPLOY_WEB_VPS.md`.
3. **P3 is done** (#314). The headline number used to be 104, and 104 was never
   104 real violations: the lint matches any `foo: number` in a component, which
   caught SVG widths, colour-ramp stops and `lerp` parameters alongside actual
   measurements. Those are annotated under the contract's own escape hatch, each
   with a reason; the self-stamping fallbacks are fixed; the rest were converted.
   `figure-contract-lint` reports zero.

4. **P2, the route merge.** This entry used to read "internal tidiness, changes
   nothing a reader sees, which is why it ranks last." That was wrong, and
   measuring it is what showed the error. P2 as section 4 of the contract defines
   it is four jobs, and only the first is internal:

   | | |
   | --- | --- |
   | collapse the three directories into `/[locale]` | mechanical, touches every page |
   | **7 routes exist in some locales and not others** | rule 2 — a product call, not a refactor |
   | **~1,320 lines of copy are hardcoded in `.tsx`** | rule 3 — 846 in the zh pages, 474 in shared components |
   | **i18n mechanism** | `lib/i18n.ts` now loads the locale files; FAQ is the first consumer. Other routes still hardcode copy. |

   The asymmetry, precisely: `analysis` and its two articles, `crisis/eu-jet-reserves`,
   `crisis/saf-tipping-point`, `grid` and `heat` exist only in zh;
   `lufthansa-saf-2026` exists only in de and en. `navigation.ts` already encodes
   this as `null` paths, which is the right shape — but closing those nulls means
   either writing German and English versions of six zh-only pages or removing
   them, and that is a decision about what the site publishes.

   One symptom of the missing mechanism is worth naming, because it is a live
   bug rather than untidiness: `app/en/sources/page.tsx` translates the read
   model's **Chinese** output by string comparison
   (`if (value === '覆盖不可用') return 'Coverage unavailable'`) and falls
   through with `return value`. Any rewording on the zh side silently ships
   Chinese text to English readers. Copy in locale files instead of in
   components is what makes that class of bug impossible, which is why rule 3
   exists.

   **#318 proved the mechanism on `faq`, then #321 reverted the middleware.**
   FAQ copy is re-landed without rewrite (see below). What the remaining ten
   routes cost was then measured rather than estimated — strip every string
   literal and comment from each page, diff the code skeleton against its `de`
   and `en` siblings, and count the lines that differ:

   | route | zh lines | differing vs de + en |
   | --- | ---: | ---: |
   | `reports` | 172 | 112 |
   | `prices/germany-jet-fuel` | 169 | 121 |
   | `research` | 213 | 239 |
   | `admin` | 181 | 284 |
   | `/` (home) | 204 | 311 |
   | `sources` | 160 | 347 |
   | `reports/tipping-point-analysis` | 235 | 504 |
   | `dashboard` | 410 | 618 |
   | `scenarios` | 259 | 720 |
   | `crisis` | 363 | 884 |

   `faq` differed by 14 lines, which is why it was the right first proof and why
   it is not representative. **The three locale trees are not one app rendered in
   three languages; they are three separately evolved implementations of the same
   idea.** Merging them is a reconciliation per route, not a refactor.

   `reports` shows the shape at its mildest. Its three pages offer three
   different sets of next actions — zh alone links to the tipping-point report,
   de alone links to launch readiness, en alone links to the research workbench —
   so a merge has to decide, per route, whether those sets converge or stay
   distinct. The current ruling is that they stay distinct and become data.

   One convergence was allowed deliberately when `reports` merged. The four
   signal cards ran readiness/source/**risk**/scenarios in zh and
   readiness/source/**scenarios**/risk in de and en; the merged page uses one
   order everywhere. Every locale already had all four cards, so nothing appears
   or disappears — and an order that differs by language is precisely the "nine
   accumulated systems" problem this program exists to remove. Which *panels* a
   locale renders is still left exactly as it was; only this ordering converged.

   And the same page carries a fix in one language that the others never got:
   `de/reports` replaces a saved scenario's name with a placeholder when the name
   contains Chinese characters, `en/reports` joins the names raw. **English
   readers can see Chinese scenario names today.** One rule reproduces two of the
   three current behaviours and corrects the third: substitute when the name's
   script does not match the reader's locale.

   **FAQ copy, safe reland (after #321).** User-facing FAQ strings now live under
   `faq` in `apps/web/src/locales/{zh,de,en}.json` and are loaded by
   `apps/web/lib/i18n.ts`. `/faq`, `/de/faq` and `/en/faq` remain real page files
   that render one shared `FaqPage` with an explicit `locale`. Middleware and
   `/[locale]` rewrites stay forbidden.

   **Prices copy, same pattern.** `/prices/germany-jet-fuel`,
   `/de/prices/germany-jet-fuel` and `/en/prices/germany-jet-fuel` render one
   shared `GermanyJetFuelPage`. The trend-chart panel is locale data
   (`show_trend_chart`): zh keeps it, de/en do not. Remaining routes still
   hardcode copy.

### Known debts, none urgent

- `apps/web/lib/research-signals-read-model.ts` stamps a signal with the current
  time when the upstream record has no `published_at`. It is recorded in the
  figure-contract baseline; clearing it means deciding what an undated signal
  should show instead. The other #304 items (nested Lufthansa cards, watch
  reserve using accent, GridHistoryChart hex) are closed.

## How the work gets delegated

Contract first, then bounded execution, then independent review, then a final
review before merge. Each stage produces something: the contract file, the
execution PR, the review findings. A stage without its artifact does not
advance.

Batches run at five to eight pages. Two can run concurrently in separate
worktrees as long as their file sets do not overlap; they will still both append
to `test/page-template-adoption.test.mjs` and to a baseline file, so expect one
small conflict per pair and resolve it by keeping both sides. Regenerate
baselines with `--update` rather than merging the JSON by hand.

`docs/task-packets/` holds the reusable constraint packet. Its value is not the
instructions — it is the accumulated list of defects that batches produced
before, each one written as a rule rather than as advice. Eight batches of
history are compressed there. Read it before writing a new batch section, and
add to it whenever a review finds something new.

The pattern that works: **give an exact table, not a rule to reason from.** The
one batch with zero review findings was the one where the mapping table was
copied verbatim out of the CSS compatibility layer. The batches with findings
were the ones that asked a model to decide what a colour meant.

Independent review earns its place. On the most recent batch it caught a defect
that the final review missed: a four-step explanatory sequence coloured
`danger → warning → muted → success` by position, where step four rendered green
while reporting how far above fossil the SAF premium sat. Semantic colour used
as decoration is invisible to the lint, because every class involved is a legal
token.

## The defect classes this program keeps producing

Recorded in full in `docs/task-packets/page-conversion-constraints.md`. The
short version, because these recur across contributors:

1. **A fallback stamped as fresh.** A default value carrying
   `generated_at: new Date()`, rendered as an observation. This is the one the
   whole `Figure` contract exists to stop.
2. **A problem state washed neutral.** Unknown source, no confidence, no signal
   — the fallback branch drops to `text-muted` and the data-quality problem
   disappears.
3. **An unknown state rendered healthy.** Worse than the above: a tone mapping
   whose default branch returns success.
4. **Semantic colour as decoration.** Navigation tinted red, a narrative step
   permanently green, a metric card whose colour never moves with its value.
5. **Collapsed interaction states.** Hover matching rest, or a selected state
   indistinguishable from a hovered one, after a token migration flattened two
   shades into one.
6. **A token that is correct and invisible.** `surface-muted` inside an
   `opacity-50` wrapper; `text-ink` on `bg-accent` at 2.76:1. The lint passes
   and the thing is unreadable.
7. **An entry point lost in a rewrite.** A link that lived only on a card that
   got replaced. Nothing reports it; the route becomes unreachable.

## Environment notes

Machine-independent:

- A stale `apps/web/dist/types/` shadows `.next/types` through the `include` in
  `apps/web/tsconfig.json`, and produces typed-route errors claiming that
  existing routes do not exist. Deleting `.next` and the build info does not
  help; delete `apps/web/dist`. CI never sees this because it checks out fresh.
- `main` is governed by a repository ruleset, not classic branch protection.
  Query it with `gh api repos/<owner>/<repo>/rules/branches/main`. One required
  check, `Verify web and API`, with the strict up-to-date policy — so every
  merge to `main` puts open PRs behind and they need a branch update plus
  another CI round.

Specific to the machine this was developed on, and worth re-verifying elsewhere:

- Writing repository files through Python text mode on Windows converts LF to
  CRLF and turns a small edit into a whole-file rewrite, which fails the release
  dry run's whitespace check. Use binary mode. Check `git diff --numstat` before
  pushing: the line counts should match the size of the edit.
- Three to six tests in `test/release-approval-contract.test.mjs` fail locally on
  Windows and pass in CI. No other test file is expected to fail locally.
