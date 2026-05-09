# Skill Management System

Last updated: 2026-05-08
Scope: local Codex, Claude, OpenCode, Gemini, plugin, and shared `.agents` skill surfaces under `/Users/yumei`.

## Purpose

This document is the durable operating model for managing local AI skills without letting Codex, Claude, OpenCode, Gemini, and plugin skill roots drift into separate truth sources.

It is a governance document, not a deletion approval. Any archive, delete, symlink replacement, or cross-assistant mirror update still requires the relevant safety gate and explicit approval when it mutates skill roots.

## Current Evidence

Latest local audit artifacts:

- Skill library: `/Users/yumei/tools/automation/runtime/skill-chains/dashboard/skills.json`
- Dedupe audit: `/Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-audit.json`
- Dedupe plan: `/Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-plan.json`
- Drift classification: `/Users/yumei/tools/automation/runtime/skill-chains/dedupe/drift-classified.md`
- Drift diffs: `/Users/yumei/tools/automation/runtime/skill-chains/dedupe/drift-diffs.md`

2026-05-08 snapshot:

| Metric | Value |
| --- | ---: |
| Visible skill files in library scan | 200 |
| Unique skill names in library scan | 103 |
| Duplicate skill names | 61 |
| Active duplicate drift risks in library scan | 0 |
| Archive-noise duplicate names in library scan | 17 |
| Alias/system-noise duplicate names in library scan | 43 |
| Dedupe audit skill file records | 176 |
| Unique real skill files | 109 |
| Unique real skill names in dedupe audit | 67 |
| Path alias groups | 67 |
| Byte-identical groups | 11 |
| Drift groups | 10 |
| Dedupe plan actions | 11 |
| Proposed symlinks | 16 |
| Active L3 behavioral drift | 0 |
| Intentional assistant variants | 1 |
| Frontmatter lint findings | 0 |
| Estimated freed space from mechanical plan | 149 KB |

Important interpretation:

- Duplicate names are not automatically bad. Some are expected assistant install surfaces or symlink aliases.
- Archive copies are evidence, not live capability. They should not be chosen as active canonical skills unless explicitly restored.
- Content drift across live assistant surfaces is the real risk because it changes when and how agents trigger skills.

## Skill Roots And Roles

| Surface | Role | Default treatment |
| --- | --- | --- |
| `/Users/yumei/.codex/skills` | Codex visible skill surface; symlink to `/Users/yumei/vibecoding/.codex/skills` | Primary runtime surface for Codex-specific skills and wrappers |
| `/Users/yumei/.agents/skills` | Shared cross-assistant source for portable workflow skills | Preferred SSOT for shared planning, goal, and assistant-neutral skills |
| `/Users/yumei/.claude/skills` | Claude compatibility surface | Keep thin; prefer pointers or symlinks over divergent copies |
| `/Users/yumei/.config/opencode/skills` | OpenCode compatibility surface | Keep only OpenCode-specific variants or symlinks to SSOT |
| `/Users/yumei/.gemini/skills` and `/Users/yumei/.gemini/antigravity/skills` | Gemini and Antigravity surfaces | Keep tool-specific skills; do not force into Codex chains unless needed |
| `/Users/yumei/.codex/plugins/cache/**/skills` | Bundled plugin skills | Treat as vendor-managed; never edit in place |
| `*/_archive/**` | Historical evidence | Exclude from live canonical selection unless explicitly restored |

## Canonical Ownership Model

Use one of four ownership classes for every skill:

1. `shared-ssot`: one assistant-neutral source, usually under `/Users/yumei/.agents/skills`, with other surfaces linked or generated from it.
2. `codex-native`: Codex-specific skill under `/Users/yumei/.codex/skills`; only mirror elsewhere when the other assistant can actually execute it.
3. `assistant-variant`: same conceptual skill but behavior differs by host, such as `codex-delegate` for Claude vs Codex. Variants must be named or described as host-specific and must not pretend to be byte-identical.
4. `vendor-managed`: plugin or bundled runtime skill. It is inventoried but not edited, deduped, or archived by local scripts.

Default SSOT choices:

- Shared planning and analysis: `/Users/yumei/.agents/skills`
- Codex execution, guards, and OMX tools: `/Users/yumei/.codex/skills`
- Plugin skills: plugin cache, vendor-managed
- Gemini-specific tools: Gemini skill roots

## Current Triage

### Keep As Separate Skills

These have distinct jobs and should not be merged just because they are in the same family:

- `analyze`, `repo-onboarding`, `code-review`, `project-boundary-inventory`, `repo-refactor-and-audit`: different read-only lenses.
- `test-harness`, `acceptance-gate-development`, `test-driven-driver`, `quality-refactor-loop`: different gate and loop semantics.
- `pr-review-guard`, `pr-push-guard`, `release-readiness-runner`, `auto-merge-action`: different release stages and approval points.
- `browser-qa`, `visual-verdict`, `ultraqa`: related QA surfaces, but `ultraqa` is a cycling workflow while the others are validation lenses.
- `workspace-health-check`, `workspace-daily-audit`, `workspace-ops-convergence`: related workspace health surfaces, but different scope and cadence.

### Mechanical Cleanup Candidates

The generated dedupe plan found 11 byte-identical groups and 16 proposed symlinks. These are safe candidates only after rollback tarball creation and explicit approval:

- `android-cli`
- `auto-merge-action`
- `cycle-effect-auditor`
- archived OMX duplicate pairs such as `autopilot`, `cancel`, `deep-interview`, `help`, `omx-setup`, `ralph`, `ralplan`, and `team`

Do not execute the plan blindly. Re-run the audit immediately before any mutation because skill roots are active configuration.

### Manual Merge Status

The first audit marked these groups as requiring human or coordinator decision before consolidation:

- `acceptance-gate-development`
- `codex-delegate`
- `quality-refactor-loop`
- `analyze`
- `plan`
- `goal-driven-execution`
- `goal-refactor`
- `overnight-goal-runner`
- `release-readiness-runner`
- `test-driven-driver`

Current status after the first cleanup slice:

- `acceptance-gate-development`: active Codex, `.agents`, and OpenCode copies are byte-identical; archive drift remains as historical evidence.
- `quality-refactor-loop`: active Codex, `.agents`, and OpenCode copies are byte-identical after deduplicating the repeated slice-sizing section; archive drift remains as historical evidence.
- `codex-delegate`: classified as `L0 Intentional Variant` because Claude and Codex/OpenCode variants intentionally differ in subject, fallback, and ledger paths.
- Remaining drift groups are `L1` cosmetic or archive-only in the current classifier output.

### Frontmatter Parser Watch

The first 2026-05-08 pass exposed a tooling issue: line-based frontmatter parsing treated valid YAML block scalars such as `description: >` and `description: >-` as low-information descriptions.

Current rule:

- Treat block scalar descriptions as valid when the indented body is present.
- Fix parser/lint tooling before editing SKILL.md metadata.
- Only classify a description as broken when a real YAML-aware or block-aware parser returns empty content.
- Keep a lint gate because Codex/Claude/OpenCode skill triggering depends on frontmatter metadata.

## Gaps To Fill With New Or Split Skills

Create or split skills only when the trigger is currently ambiguous, repeated, and not already covered by a chain.

Recommended additions:

1. `skill-management-system`: use when auditing, deduping, promoting, archiving, or mirroring AI skills. It should point to this SOP and the existing audit scripts.
2. `skill-frontmatter-lint`: a small deterministic validator or subcommand, not necessarily a full skill, that fails on empty descriptions, placeholder block scalars, missing `name`, invalid `chains`, or archive paths selected as SSOT.
3. `assistant-surface-sync`: a controlled workflow for copying or linking a confirmed SSOT skill to Claude/OpenCode/Gemini surfaces, with rollback tarball and post-sync audit.
4. `skill-archive-retirement`: a narrow workflow for moving old `_archive` evidence into dated archive bundles after the dedupe plan confirms byte identity and no live references.

Do not create broad replacement skills like `developer`, `qa`, `review`, or `workflow-manager`. The current chain registry already provides the orchestration layer.

## Standard Operating Loop

Run this loop before any skill cleanup or new skill creation:

1. Choose AI support lane when a second opinion or delegated execution is useful:

```bash
python3 /Users/yumei/tools/automation/scripts/ai-model-router.py --task hard_review --json
```

The router is decision-only. It does not call external model APIs and does not authorize skill-root mutation.

1. Refresh evidence:

```bash
python3 /Users/yumei/tools/automation/scripts/skill-dedupe-audit.py \
  --out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-audit.json \
  --drift-diff-out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/drift-diffs.md

python3 /Users/yumei/tools/automation/scripts/skill-dedupe-drift-classify.py

python3 /Users/yumei/tools/automation/scripts/skill-dedupe-plan.py \
  --out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-plan.json

python3 /Users/yumei/tools/automation/scripts/skill-library.py \
  --once \
  --out /Users/yumei/tools/automation/runtime/skill-chains/dashboard

python3 /Users/yumei/tools/automation/scripts/skill-frontmatter-lint.py --json
```

1. Classify the target as `shared-ssot`, `codex-native`, `assistant-variant`, or `vendor-managed`.
2. If the target is manual-merge, decide winner or merge content into one SSOT file.
3. If the target is byte-identical, create a rollback tarball before replacing copies with symlinks or archiving.
4. Re-run audit, library, and dashboard fixture after changes.
5. Write trace with the changed skill names, verification commands, and remaining risk.

## Hard Stop Rules

Stop and do not mutate skill roots when:

- A skill is under a plugin cache or bundled runtime path.
- A live assistant surface has host-specific behavior that would be lost by symlinking.
- The dedupe plan says `requires_manual_merge`.
- The only candidate winner is under `_archive`.
- Any target path contains secrets, private runtime state, or generated logs.
- The task would delete archives instead of moving them into a dated rollback bundle.
- Post-change audit cannot be run.

## Verification

Minimum verification for documentation-only changes:

```bash
python3 /Users/yumei/tools/automation/scripts/skill-frontmatter-lint.py --json
python3 /Users/yumei/tools/automation/scripts/skill-library.py --once --out /Users/yumei/tools/automation/runtime/skill-chains/dashboard
python3 /Users/yumei/tools/automation/scripts/skill-dedupe-audit.py --out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-audit.json
git diff --check -- /Users/yumei/tools/automation
```

Minimum verification for skill-root mutations:

```bash
python3 /Users/yumei/tools/automation/scripts/skill-dedupe-audit.py --out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-audit.json --drift-diff-out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/drift-diffs.md
python3 /Users/yumei/tools/automation/scripts/skill-dedupe-drift-classify.py
python3 /Users/yumei/tools/automation/scripts/skill-dedupe-plan.py --out /Users/yumei/tools/automation/runtime/skill-chains/dedupe/dedupe-plan.json
python3 /Users/yumei/tools/automation/scripts/skill-library.py --once --out /Users/yumei/tools/automation/runtime/skill-chains/dashboard
python3 /Users/yumei/tools/automation/scripts/skill-frontmatter-lint.py --json
bash /Users/yumei/tools/automation/workspace-guides/skill-chains/fixtures/run-all-verifications.sh
git diff --check -- /Users/yumei/tools/automation
```

## Near-Term Upgrade Plan

1. Keep frontmatter parsers block-scalar aware and add a lint gate so future malformed metadata is caught accurately.
2. Render the new skill library duplicate metadata in the dashboard UI, not only in JSON/CLI output.
3. Add a fixture assertion that `active_drift_risk_names` stays zero unless a real active hash split appears.
4. After one green observation window, run the mechanical byte-identical dedupe plan with rollback tarball and explicit approval.
