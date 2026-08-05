# JetScope UI Contract

Single source of truth for how any JetScope page may look and behave. Written to
be enforceable, not aspirational: every rule here is either checked by
`npm run web:gate` or rejectable in review by quoting one line of this file.

Any contributor — human, Claude, Codex, or Grok — reads this before touching
`apps/web`. **Contract changes never ride along in a feature PR.** They are their
own PR, reviewed on their own.

---

## 0. Why this exists

Measured on `agent/front-end-stability-design` (2026-08-05):

- `apps/web/app/globals.css` defines a real token layer (`--js-*`) and a
  component layer (`.js-*`) — good — but still carries a **legacy override
  block** that repaints dark utility classes (`bg-slate-900`, `text-slate-100`,
  …) into light values with `!important`. While that block exists, *the class a
  developer writes is not the color that renders* — and **50 of 100 `.tsx` files
  still depend on it**, across **2,303 raw color utilities in 75 files**.
- `tailwind.config.ts` exposed `ink` / `panel` / `accent` and was never loaded at
  all: this app runs Tailwind v4, where a config file only applies via `@config`,
  which `globals.css` never declared. So the theme was dead code and components
  had no token utilities to reach for.
- `web:lint` is an alias for `typecheck`. Nothing can fail a PR for style drift.
- `components/shell.tsx` hardcodes a **different navigation list per locale**
  (zh has no Prices; de/en have no Grid or Heat). The IA disagrees with itself.

Consistency currently depends on who wrote the page last. With multiple AI
contributors that guarantee is zero. This contract replaces "everyone try to be
consistent" with "the gate says no".

---

## 1. Tokens — the only allowed color vocabulary

Tokens already exist as CSS variables in `globals.css`. They are **the** palette.
Do not introduce a second naming scheme.

| Variable | Tailwind alias | Meaning |
| --- | --- | --- |
| `--js-canvas` | `bg-canvas` | page background |
| `--js-surface` | `bg-surface` | cards, panels |
| `--js-surface-muted` | `bg-surface-muted` | table stripes, inset blocks |
| `--js-line` | `border-line` | default hairline |
| `--js-line-strong` | `border-line-strong` | emphasized separation |
| `--js-ink` | `text-ink` | primary copy |
| `--js-muted` | `text-muted` | secondary copy, labels |
| `--js-subtle` | `text-subtle` | captions, timestamps |
| `--js-accent` / `--js-accent-soft` | `text-accent` / `bg-accent-soft` | brand, links, focus |
| `--js-accent-hover` | `bg-accent-hover` | hover / active tint for a surface already on `accent-soft` |
| `--js-success` / `--js-success-soft` | `text-success` / `bg-success-soft` | within target, improving |
| `--js-warning` / `--js-warning-soft` | `text-warning` / `bg-warning-soft` | watch, **assumption-based** |
| `--js-danger` / `--js-danger-soft` | `text-danger` / `bg-danger-soft` | threshold breached |

Measured contrast on `surface`, so nothing above needs re-deriving: ink 16.45 ·
danger 6.46 · accent 5.97 · muted 5.43 · warning 5.19 · success 5.00 · subtle
4.82. Every token clears 4.5:1 and is therefore safe for body text. `subtle`
started at `#8390a1` (3.25:1) and was darkened to meet section 5.

Rules:

1. Tokens are declared **once**, in the `@theme` block of `globals.css`. The
   `--js-*` variables are aliases that reference them; they never hold literals.
   The dead v3 `tailwind.config.ts` is deleted.
2. Raw Tailwind color utilities (`slate-*`, `sky-*`, `rose-*`, `amber-*`, …) are
   forbidden in `apps/web/app/**` and `apps/web/components/**`.
3. Hex literals are forbidden outside the `:root` token block.
4. `!important` is forbidden in `globals.css` outside the deprecated
   compatibility layer, which is frozen: adding a selector to it is a violation.
   It is deleted the moment `scripts/design-system-baseline.json` reaches zero.
5. Semantic colors carry meaning. `danger` on screen means a threshold was
   breached — never "red looked better here".
6. One theme. No dark mode until this contract adds one.
7. **An interactive element must not look the same in two different states.**
   A hover style equal to the resting style is a dead affordance, and a selected
   style equal to a hovered style makes selection unreadable.

   | Element | Resting | Hover |
   | --- | --- | --- |
   | Neutral control | `border-line bg-surface` | `border-accent bg-accent-soft` |
   | Accent control | `border-accent bg-accent-soft` | `bg-accent-hover` |
   | Item in a selection group, unselected | `border-line bg-surface` | `border-line-strong bg-surface-muted` |
   | Item in a selection group, selected | `border-accent bg-accent-soft` | — |
   | **Status card** (carries a semantic tint) | `border-line bg-{semantic}-soft` | `border-{semantic}`, **tint unchanged** |
   | **Solid control** (filled primary button) | `bg-{semantic} text-surface` | `bg-ink` |

   A solid fill takes **`text-surface`, never `text-ink`.** Every semantic token
   is dark enough to clear 4.5:1 against white and nowhere near it against ink:

   | Fill | white text | ink text |
   | --- | ---: | ---: |
   | `accent` | 5.97 | **2.76** |
   | `success` | 5.00 | 2.31 |
   | `warning` | 5.19 | 2.40 |
   | `danger` | 6.46 | 2.99 |

   The ink column is the whole reason this row exists: a filled button written
   as `bg-accent text-ink` looks deliberate, passes every lint, and fails WCAG.
   It shipped twice before this row was written.

   The last row is the one that gets misread. **A status card keeps its tint on
   hover.** Sending it to `surface-muted` drains the color that encodes the
   status, so the card reads as having changed state when the user merely moved
   the mouse. Only the selection-group row uses the neutral hover, because there
   the neutral is what distinguishes hovered from selected.

Scale — no other values:

- Radius `rounded-xl` (controls) / `rounded-2xl` (cards, panels).
- Elevation `shadow-sm` (cards) / sticky header shadow only. No colored shadows.
- Section rhythm `space-y-8`; grid gap `gap-6`; spacing on Tailwind's 4px scale.
- Type: `text-xs` uppercase `tracking-[0.18em]` eyebrows · `text-sm` body ·
  `text-lg` panel titles · `text-3xl` page title · metric values `text-3xl
  tabular-nums`. **All numbers use `tabular-nums`.**

---

## 2. Page skeleton — every page, no exceptions

```
Shell
└── PageTemplate
    ├── PageHeader     eyebrow · title · one-sentence decision question · as-of
    ├── SignalRow      2–4 MetricCards — the answer, above the fold
    ├── Section[]      each: title · why-it-matters line · exactly one artifact
    └── SourceFooter   sources · method link · limitations
```

1. A page answers **one decision question**, stated in the header. If it takes
   two sentences to say which decision the page supports, it is two pages.
2. `SignalRow` carries the conclusion, not raw inputs. A reader who stops after
   the first screen still leaves with the answer.
3. One artifact per section — chart, table, workbench, or timeline. No stacked
   charts inside a section.
4. Every page ends with `SourceFooter`. A page with no sources does not ship.
5. `max-w-7xl` content width, 12-column grid. Charts go full width below `lg`
   and never render in a column narrower than 320px.
6. Empty, loading, and error states are **required** for every data-backed
   section. "Renders nothing when the API is down" is a bug, not a state.

---

## 3. Data honesty — the reasoning chain

Every number on screen must answer four questions on screen or one click away:
*what is it · when is it from · where did it come from · how was it derived.*

Read models return:

```ts
type Figure = {
  value: number | null;
  unit: string;
  asOf: string;                                    // ISO 8601, source time, not fetch time
  sourceId: string;                                // resolvable in the sources registry
  basis: 'observed' | 'derived' | 'assumption';
  method?: string;                                 // required when basis !== 'observed'
};
```

1. Display components accept `Figure`, not bare `number`. A bare number in a
   metric or table cell is a contract violation.
2. `basis: 'assumption'` renders a visible `warning` marker reading
   "情景假设 / scenario assumption". Assumptions are never styled to look like
   observations. This is the rule the EU reserve-days fallback broke; it does not
   get re-broken.
3. `value: null` renders "—" plus the reason. Never `0`, never a silent fallback
   to a stale figure.
4. A `derived` figure links to its method section. No `method`, no merge.
5. Timestamps render in the reader's locale with an explicit timezone. Data older
   than its source's expected cadence renders in `warning`.

---

## 4. Information architecture

1. Navigation is defined **once**, in `apps/web/lib/navigation.ts`, as a single
   route list with per-locale labels. Literal nav arrays in `shell.tsx` are a
   contract violation.
2. Every route exists in every supported locale, or in none. Locale-specific
   *content* is fine; locale-specific *routes* are not.
3. User-facing copy lives in `apps/web/src/locales/{zh,de,en}.json`. Hardcoded
   strings in `.tsx` are a violation (proper nouns and units excepted).
4. Routes are `/[locale]/<section>`, with `zh` served at `/`. Legacy paths keep
   permanent redirects, guarded by `test/routing.test.mjs`.

---

## 5. Accessibility & performance floor

- Contrast ≥ 4.5:1 body text, ≥ 3:1 large text and non-text indicators, measured
  against the token background it actually renders on.
- **A shape must survive its own container.** `surface-muted` inside an
  `opacity-50` wrapper is white on white - the element is simply gone. Dots,
  connectors, rules and other non-text marks use `line` or `line-strong`, never
  `surface` or `surface-muted`, whenever the thing behind them is also light.
  A timeline lost its entire future half to this.
- Color is never the only carrier of meaning — pair with label, icon, or shape.
- Every interactive element is keyboard reachable with a visible focus ring
  (`ring-2 ring-accent`). No `outline: none` without a replacement.
- Charts expose an accessible table equivalent or an `aria-label` summary.
- ≤ 200 KB gzipped route JS. Client components only where interaction requires
  it; static charts render on the server.

---

## 6. The gate

A rule that isn't checked will drift. `npm run web:gate` runs, in order:

1. `next build`
2. `tsc --noEmit`
3. `node scripts/design-system-lint.mjs` — raw color utilities, `!important`
   outside the deprecated layer, missing `@theme` block, nav arrays outside
   `navigation.ts`
4. `node scripts/figure-contract-lint.mjs` — display components typed with bare
   `number` (arrives in P3)

**The lint is a ratchet, not a big bang.** `scripts/design-system-baseline.json`
records how many violations each legacy file is currently allowed. A file not in
the baseline must be clean; a baselined file may never get worse; a file that
improves must have its baseline lowered (`--update`) so the gain is locked in.
That is how a 2,303-violation codebase gets a working gate on day one instead of
after a 2,000-line unreviewable diff.

---

## 7. Phase order

| Phase | Scope | Done when |
| --- | --- | --- |
| **P0** | Tailwind ↔ token wiring · migrate 11 dark-class files · delete the legacy override block · `design-token-lint` in the gate | writing a raw color turns CI red |
| **P1** | `PageTemplate` / `SignalRow` / `Panel` / `DataTable` / `SourceNote`; convert all pages | every page shares one skeleton |
| **P2** | `navigation.ts`; collapse `/`, `/de`, `/en` into `/[locale]`; copy from locale files | three locales, one IA |
| **P3** | `Figure` contract through the read-model layer; `figure-contract-lint` | no bare numbers on screen |
| **P4** | Web production container + nginx on the VPS | frontend reachable in public |

Phases run **strictly in order**, one branch at a time. Two contributors never
edit the same file set concurrently.

---

## 8. PR checklist — paste into every frontend PR

- [ ] No raw color utilities · no `!important` · no hex outside tokens
- [ ] Page uses `PageTemplate`; header states one decision question
- [ ] `SignalRow` shows the conclusion, not inputs
- [ ] Every figure carries value · unit · as-of · source · basis
- [ ] Assumptions visibly marked; nulls render "—" with a reason
- [ ] Empty / loading / error states present
- [ ] Strings from locale files; route exists in all locales
- [ ] Keyboard reachable, focus visible, contrast checked
- [ ] `npm run web:gate` passes locally
