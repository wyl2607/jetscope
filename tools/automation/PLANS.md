# Tools Automation Plans

Last updated: 2026-05-08
Scope: `/Users/yumei/tools/automation`

## Active Plan: Skill Maintenance Ownership

### Goal

Make `tools/automation` the durable control plane for maintaining local AI skills across Codex, Claude, OpenCode, Gemini, plugin caches, and shared `.agents` surfaces.

### Context

- The canonical SOP is `workspace-guides/skill-chains/SKILL_MANAGEMENT_SYSTEM.md`.
- Current live skill drift evidence is healthy: `active_drift_risk_names=0`, `L2=0`, and `L3=0` after the 2026-05-08 cleanup slices.
- Skill evidence lives under `runtime/skill-chains/dashboard/` and `runtime/skill-chains/dedupe/`; these are generated local runtime surfaces, not source.
- `tools/automation` remains a local workspace automation package, not an independent public project.

### Constraints

- Do not mutate skill roots, replace copies with symlinks, delete archives, push, open PRs, sync workers, or touch remotes without explicit approval.
- Treat plugin cache skills as vendor-managed and read-only.
- Treat `_archive` skills as historical evidence unless explicitly restored.
- Prefer existing scripts over ad hoc scans.
- Fix parser or lint tooling before editing `SKILL.md` metadata when a finding may be parser-related.

### Done Criteria

- Daily skill evidence can be refreshed with one documented command set.
- Dashboard and JSON outputs clearly distinguish active drift risk, intentional variants, archives, aliases, system-managed copies, and vendor-managed copies.
- Frontmatter lint catches real malformed metadata without flagging valid YAML block scalar descriptions.
- Any skill-root mutation has a rollback tarball, refreshed audit evidence, dashboard fixture pass, and trace write-back.
- Mechanical dedupe runs only after a green observation window and explicit approval.

### Current Evidence Refresh

Run from `/Users/yumei/tools/automation`:

```bash
python3 scripts/skill-dedupe-audit.py --out runtime/skill-chains/dedupe/dedupe-audit.json --drift-diff-out runtime/skill-chains/dedupe/drift-diffs.md
python3 scripts/skill-dedupe-drift-classify.py
python3 scripts/skill-dedupe-plan.py --out runtime/skill-chains/dedupe/dedupe-plan.json
python3 scripts/skill-library.py --once --out runtime/skill-chains/dashboard
python3 scripts/skill-dedupe-watch.py --analyze
python3 scripts/skill-frontmatter-lint.py --json
```

Expected current result:

- `skill-library.py`: 200 visible skill files, 103 unique skills, 0 active drift risk names, 1 intentional variant.
- `skill-dedupe-drift-classify.py`: `L0=1`, `L1=9`, `L2=0`, `L3=0`.
- `skill-dedupe-plan.py`: 11 byte-identical groups and 16 proposed symlinks remain approval-gated.
- `skill-dedupe-watch.py --analyze`: SSOT sha stable, no anomalies.
- `skill-frontmatter-lint.py --json`: `ok=true`, `finding_count=0`.

## AI Support Lane Routing

### Goal

Use external AI lanes as bounded support tools for skill maintenance, not as uncontrolled project owners.

### Verified Lanes

- Automatic decision router:
  `python3 scripts/ai-model-router.py --task <task> --json`
  - First chooses a lane/model/fallback chain without calling external APIs.
  - For a guarded execution preview, pass `--prompt "<read-only prompt>" --json`; this stays dry-run by default, redacts secrets, and shows the argv that would be used.
  - To actually call the selected lane, pass `--execute --timeout-seconds <n>`; failures are recorded into router cooldown state.
  - Supported task classes: `fast_probe`, `structured_check`, `hard_review`, `large_implementation`, `chinese_reasoning`, `codex_execution`.
- Command Code DeepSeek lane:
  `cmd -p "<read-only prompt>" --skip-onboarding`
  - 2026-05-08 smoke: returned `DEEPSEEK_OK` after network approval.
- OpenCode Go DeepSeek V4 Pro lane:
  `OPENCODE_MODEL=opencode-go/deepseek-v4-pro OPENCODE_VARIANT=high /Users/yumei/vibecoding/.codex/skills/opencode-model-router/scripts/opencode-model-call "<read-only prompt>"`
  - 2026-05-08 smoke: returned `OPENCODE_DEEPSEEK_OK` after network approval.

### Default Use

- Always ask `scripts/ai-model-router.py` first for non-trivial model routing unless a task explicitly requires a specific lane.
- DeepSeek via `cmd -p`: cheap read-only second opinion, plan review, diff review, risk review.
- OpenCode Go `deepseek-v4-pro`: harder architecture/debug/review questions where model quality matters.
- OpenCode Go `deepseek-v4-flash`: fast probes and simple triage after the route is stable.
- OpenCode Go `kimi-k2.6`: larger implementation or long-context coding only after a bounded plan exists.
- OpenCode Go `qwen3.6-plus`: Chinese structured reasoning or second opinion.
- Copilot CLI: GitHub-native or independent coding-agent review; do not let it own gates.
- Codex CLI: bounded implementation goal packets with explicit allowlists and local verification.

### Hard Rules

- External lanes default to read-only prompts.
- The router is dry-run by default; external model execution requires explicit `--execute`.
- The executor wrapper redacts prompt/output captures before storing or printing. Do not intentionally include secrets; redaction is a guardrail, not permission to send sensitive data.
- Codex executor calls are forced through `--sandbox read-only --skip-git-repo-check`.
- Do not send secrets, auth files, `.env*`, private ledgers, or sensitive runtime dumps.
- Do not ask external lanes to push, deploy, sync, mutate remotes, bypass guards, or edit plugin caches.
- For execution, use narrow allowlists and local verification; Codex remains responsible for final synthesis and validation.

### Next Development Slices

1. Done: render duplicate metadata in the dashboard UI.
   - Allowed: `scripts/skill-chain-dashboard.py`, `workspace-guides/skill-chains/chain-gates/skill_chain_dashboard.py`, dashboard fixtures/tests.
   - Verification: dashboard fixture plus static UI tests.

2. Done: add a fixture assertion that `active_drift_risk_names` remains zero unless a real active hash split appears.
   - Allowed: skill dashboard/dedupe fixtures and tests only.
   - Verification: `bash workspace-guides/skill-chains/fixtures/dashboard/run-dashboard.sh`, `python3 -m unittest tests.test_skill_chain_dashboard_static_ui`, `bash -n workspace-guides/skill-chains/fixtures/dashboard/run-dashboard.sh`, and `git diff --check -- /Users/yumei/tools/automation/workspace-guides/skill-chains/fixtures/dashboard/run-dashboard.sh`.

3. Done: prepare, but do not execute, the mechanical dedupe approval packet.
   - Allowed: source docs and generated runtime proposal artifacts.
   - Forbidden: symlink replacement, archive move/delete, root mutation, or remote action without explicit approval.

4. Done: add a default-dry-run executor wrapper for AI model routing.
   - Allowed: `scripts/ai-model-router.py`, router tests, local progress docs.
   - Verification: router unit tests, self-test, dry-run redaction smoke, py_compile, and diff check.
   - Guardrails: no external model call unless `--execute`; timeout and cooldown recording on failure; Codex lane uses read-only sandbox.

5. Next: keep doc-drift and skill-drift review-first queues healthy through task packets.
   - Allowed: registered source docs, dashboard fixtures/tests, and generated runtime proposal artifacts.
   - Forbidden: skill root mutation, symlink replacement, archive move/delete, Obsidian write-back, remote action, push, PR, sync, or deploy without explicit approval.

### Handoff Packet Template

Use this shape for any delegated skill-maintenance task:

```text
目标：one bounded skill-maintenance objective.
上下文：tools/automation, current drift summary, relevant SOP/scripts.
允许修改：narrow file allowlist.
禁止修改：skill roots unless approved, plugin caches, archives, remotes, git history, secrets.
执行方式：CLI-first; refresh evidence before and after.
验证：focused commands with expected pass criteria.
完成标准：observable output change plus trace/progress write-back.
交付：changed files, validation results, remaining risk.
```
