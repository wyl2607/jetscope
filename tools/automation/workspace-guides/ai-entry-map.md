# AI Entry Map

Purpose: give every AI agent a small, stable first map for understanding
`/Users/yumei/tools/automation` without loading the whole workspace at once.

Machine-readable companion:
`/Users/yumei/tools/automation/workspace-guides/ai-entry-map.json`.

## How To Read This Project

Start with the smallest layer that can answer the task. Only expand into deeper
docs when the task touches that area.

1. Entry contract
   - `/Users/yumei/tools/automation/AGENTS.md`
   - `/Users/yumei/tools/automation/workspace-guides/ai-entry-map.json`
2. Current project state
   - `/Users/yumei/tools/automation/PROJECT_PROGRESS.md`
   - `/Users/yumei/tools/automation/plan.md`
   - `/Users/yumei/tools/automation/README.md`
3. Boundary and safety
   - `/Users/yumei/AGENTS.md`
   - `/Users/yumei/tools/automation/workspace-guides/automation-source-runtime-classification.md`
   - `/Users/yumei/tools/automation/workspace-guides/automation-project-split-decision.md`
4. Runtime truth, only when needed
   - `runtime/dev-control/state.json`
   - `runtime/task-board/full-chain-report.json`
   - `runtime/multi-agent/long-run-readiness.json`

Do not treat chat memory as project truth when a source or runtime evidence file
exists.

## Progressive Discovery Lanes

Use these lanes to decide what to read next.

| Task shape | Read next | Why |
| --- | --- | --- |
| Any non-trivial local change | `PROJECT_PROGRESS.md`, `plan.md`, `automation-source-runtime-classification.md` | Establish current status and source/runtime boundary. |
| Cross-AI routing, model choice, provider state | `ai-systems-registry.json`, `ai-model-selection-guide.md`, `PLANS.md` | Use the current machine-readable routing facts and human policy. |
| Local AI assistants, CLIs, desktop apps, provider inventory | `ai-systems-registry.json`, `ai-systems-registry.md`, `refresh_ai_systems_registry.py` | Maintain one non-secret inventory of installed AI surfaces and runtime bindings. |
| External AI orchestration candidates | `external-orchestration-candidates.md`, candidate clone README/package metadata under `runtime/external-repos/` | Reuse proven subsystems only after read-only local evaluation and explicit activation decisions. |
| Skill maintenance or skill drift | `PLANS.md`, `workspace-guides/skill-chains/SKILL_MANAGEMENT_SYSTEM.md`, `runtime/skill-chains/dashboard/` | Keep skill work review-first and evidence-backed. |
| Multi-agent or delegated work | `workspace-guides/multi-agent/README.md`, `sdd-agent-workflow.md` | Use bounded task packets and role-specific evidence. |
| Dev-control, task board, approval, runner behavior | `dev-control-queue-runbook.md`, `dev-control-runner-task.md`, `task-board-runbook.md` | Keep queue state, runner state, and approvals distinct. |
| VPS, sync, Windows, or cross-device handoff | `parallel-dev-vps-handbook.md`, `windows-opencode-handoff.md`, `repo-refactor-and-audit-sop.md` | These are high-risk boundaries and need explicit approval for mutation. |
| Documentation drift, project records, Obsidian mirror | `document-maintenance-policy.md`, `project-records-standard.md`, `obsidian-mirror-policy.md` | Keep source truth, mirrors, and local records separate. |
| Repo-evolver maintenance system design | `repo-evolver-maintenance-system.md`, `plan.md`, `.evolver/risk-policy.md` | Use the Git-first maintenance pipeline direction without treating future integrations as already approved. |
| Frontend/dashboard UI work | relevant source file, dashboard fixture, then browser QA | Validate visually when UI output changes. |

## Inclusion Rule

When a new stable subsystem is added, update the AI entry system in this order:

1. Add the human explanation to the nearest source guide.
2. Add or update a small entry in `ai-entry-map.json`.
3. Link only the shortest useful pointer from `AGENTS.md`, `README.md`, or
   `PROJECT_PROGRESS.md`.
4. If the file is a durable source surface, register it in
   `workspace-guides/evolution-registry.json`.
5. Run focused validation for changed docs or JSON.

This keeps `AGENTS.md` short while still letting agents discover the rest of the
system gradually.

## Hard Boundaries

- No push, PR, deploy, sync, launchd mutation, remote mutation, VPS mutation, or
  destructive Git operation without explicit approval.
- Do not read or print secrets.
- Do not publish runtime files, generated reports, local backups, private
  ledgers, or machine state unless they have been explicitly classified.
- Treat `runtime/` as evidence, not source.
- Treat Obsidian mirrors as reading surfaces, not canonical truth.
