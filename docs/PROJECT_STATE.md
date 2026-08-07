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
| **P1** | palette migration | 318 violations across 12 files remain, ratcheted |
| **P1.5** | page template on every page | **done — 42 of 42** |
| **P2** | collapse `/`, `/de`, `/en` into `/[locale]` | about 10 percent, only `navigation.ts` |
| **P3** | `Figure` contract through the read models | contract and gate landed; **38** violations across 14 files to clear |
| **P4** | web container and nginx on the VPS | site is live and current, served by systemd; container built but not cut over |

Both ratchets only turn one way and both run in `npm run web:gate`:

- `scripts/design-system-lint.mjs` with `scripts/design-system-baseline.json`
- `scripts/figure-contract-lint.mjs` with `scripts/figure-contract-baseline.json`

A file absent from a baseline must be clean. A file in one may never get worse.
A file that improves must have its baseline lowered with `--update`, so the gain
is locked in.

## What to do next, in order

**Deployed 2026-08-08.** The site was live the whole time on a build older than
P1.5 — 32 commits behind — because `--rebuild` only ever rebuilt the API
container and the frontend is systemd-owned. Fixed and deployed:
`.deploy-commit` is `aeb0dd7`, and `https://saf.meichen.beauty/sources` now
renders both its decision question and a real `data-testid="page-as-of"` stamp,
which is proof the server-side fetch reached the API rather than falling back.

Production, verified on the host:

| | |
| --- | --- |
| the site | live, current with `main` |
| the frontend process | **systemd**, `jetscope-web.service` on `127.0.0.1:3000` |
| the edge | **host** nginx on `:80`/`:443` — **shared with `esg.meichen.beauty`** |
| the API | `jetscope-api` container on `127.0.0.1:8000` |
| host memory | 1967 MiB total, ~1250 available. The Next build is the tight step. |

To deploy, from an environment with `rsync` (WSL, not Git Bash):

```bash
bash scripts/deploy-usa-vps.sh --rebuild
```

`npm ci` runs only when the lockfile hash differs from the previous deploy's,
because it removes `node_modules` and the live server needs it. Expect a few
minutes of degradation on a dependency change; a source-only deploy skips it.
The build runs before the restart, so a failed build leaves the previous version
serving.

1. **P4 proper, the containerisation.** `apps/web/Dockerfile`,
   `output: 'standalone'`, the `web` and `nginx` services in
   `docker-compose.prod.yml`, and `infra/nginx.prod.conf` are all in and
   locally verified. **They are deliberately not started by the deploy script**:
   `web` wants `:3000` and `nginx` wants `:80`/`:443`, all three of which are
   held by the systemd unit and host nginx.

   **This is now less attractive than it looked.** The `:80`/`:443` those
   services want are not JetScope's alone — host nginx on that VPS also serves
   `esg.meichen.beauty`. Taking the edge into a JetScope container means taking
   responsibility for an unrelated product's uptime and certificates, and a
   botched cutover breaks both. Reconsider the scope before doing it: the
   defensible version is containerising **only** the web process, leaving host
   nginx as the shared edge and repointing its upstream. The full-edge version
   in `docs/DEPLOY_WEB_VPS.md` was written before the shared vhost was known.

   Either way it is a deliberate operation with a rehearsed rollback, not a flag
   on a routine deploy.
3. **P3 cleanup, the remaining figure violations.** The headline number used to
   be 104, and 104 was never 104 real violations: the lint matches any
   `foo: number` in a component, which caught SVG widths, colour-ramp stops and
   `lerp` parameters alongside actual measurements. Those are annotated now
   under the contract's own escape hatch, each with a reason, and the
   self-stamping fallbacks are fixed. What is left is measurements, which is
   what the number should have meant all along.

   The rest is the real conversion: read models and display components carrying
   `Figure` instead of bare `number`, which is what makes requirement 3 above
   true per number rather than per page. Mechanical and delegable, in batches
   grouped so a component and its read model move together.

4. **P2, the route merge.** Internal tidiness. It changes nothing a reader sees,
   which is why it ranks last.

### Known debts, none urgent

- `apps/web/app/de/lufthansa-saf-2026/` uses `ClientMarketData` and
  `ClientBreakevenCalculator`, which still draw their own card chrome and
  therefore nest a card inside the wrapping `Panel`. Contract section 2 rule 3.
- `getReserveSeverity` in `apps/web/lib/market-signals.ts` returns `text-accent`
  for the 4-to-6-week watch level. Accent is the product colour, not a severity;
  a watch state should read as a warning.
- `GridHistoryChart` contains literal SVG colours. The design lint does not scan
  SVG attributes, so this is invisible to the gate.
- `apps/web/lib/research-signals-read-model.ts` stamps a signal with the current
  time when the upstream record has no `published_at`. It is recorded in the
  figure-contract baseline; clearing it means deciding what an undated signal
  should show instead.

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
