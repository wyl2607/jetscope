# Root Workspace Scripts

This directory contains `/Users/yumei` workspace-level governance and operations helpers. It is not a project application script directory.

## Safety Rules

- Read-only checks may run locally.
- Commands that install, update, sync, deploy, clean remote state, or touch VPS/control-plane nodes require explicit approval.
- Do not commit generated reports, logs, credentials, shell history, AI runtime state, or project runtime artifacts from this root repo.
- Project-specific release/sync scripts live inside their project directories, for example `projects/jetscope/scripts/`.

## Current Source Candidates

- `daily_ai_tools_update_check.py`: read-only AI tool and node health report generator. It probes local/remote versions for `codex`, `claude`, `omx`, `opencode`, `kilocode`, `kilo`, `copilot`, and `gemini`; checks Tailscale identity/state, system update availability, and per-node maintenance recommendations; applies VPS policy checks; writes local runtime reports under `tools/automation/runtime/`; and does not remediate state.
- `dirty_tree_guard.py`: read-only commit/publish guard for AI-produced worktrees. It blocks staged/tracked/untracked runtime, cache, log, tool-state, archive, nested-repo, secret-like, and unknown untracked artifacts before they can enter commit or push flows.
- `ops_hub.sh`: local orchestration wrapper for daily/weekly profiles. The default daily profile refreshes the AI systems registry, runs the daily AI tools check, and writes an ops journal.
- `internal_device_update_orchestrator.py`: high-risk AI tool and opt-in package-maintenance updater for internal devices. Use `--dry-run` for review; real update runs can change local or remote tool installations and require explicit approval. Local/mac-mini `opencode` is Homebrew-managed, npm updates the npm-managed AI tools, and VPS targets require `--include-vps` plus explicit OS-update gates; AI tool installs on VPS remain blocked by policy.
- `opencode-model-resolver.py`: read-only local helper that resolves the first preferred OpenCode model from `~/.config/opencode/opencode.json`; it does not write config or contact providers.
- `obsidian_workspace_bridge.py`: local-only one-way bridge that writes a workspace project index into the local Obsidian vault. It does not read vault note contents or copy vault files into repositories.
- `probe-gpt55-authenticity.sh`: relay anti-spoof probe for `gpt-5.5` using Responses API behavior, negative controls, sampling, and optional official OpenAI A/B comparison.
- Obsidian helper scripts are local/private source candidates. They default to dry-run and must not be run with `--apply` without explicit approval.

## Common Read-Only Checks

```bash
python3 /Users/yumei/scripts/daily_ai_tools_update_check.py
python3 /Users/yumei/scripts/dirty_tree_guard.py --mode pre-commit
bash /Users/yumei/scripts/ops_hub.sh run-profile daily
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets local --dry-run --print-json
python3 /Users/yumei/scripts/opencode-model-resolver.py --self-test
python3 /Users/yumei/scripts/obsidian_workspace_bridge.py --dry-run
bash /Users/yumei/scripts/probe-gpt55-authenticity.sh --help
```

The latest daily check summary is:

```bash
sed -n '/## Tailscale/,$p' /Users/yumei/tools/automation/runtime/ai-tools-update-check/latest-report.md
```

Use that report to decide whether AI tools, system packages, or Tailscale reachability need attention before running any updater.

## High-Risk Operations

These are not default checks:

```bash
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --verify-after
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets mac-mini,coco,windows-pc --verify-after
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets local --install-local-brew-updates --verify-after
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets usa-vps,france-vps --include-vps --install-vps-system-updates --verify-after
python3 /Users/yumei/scripts/obsidian_vault_cleanup_apply.py --apply
python3 /Users/yumei/scripts/obsidian_vault_inbox_stub_cleanup.py --apply
python3 /Users/yumei/scripts/obsidian_vault_inbox_topic_route.py --apply
```

Run them only after confirming the intended target set and approval boundary.

## Output Locations

- AI tools reports: `tools/automation/runtime/ai-tools-update-check/`
- Internal device update reports: `tools/automation/runtime/internal-device-updates/`
- Ops daily journal: `tools/automation/runtime/ops-daily-journal/`
- Obsidian project index: `/Users/yumei/Obsidian/MyKnowledgeVault/30-AI-Ingest/workspace-project-index.md`
- GPT probe reports: `gpt55-probe-report-*.json` in the current working directory unless `--out` is provided.
- Obsidian audit/repair reports: `obsidian-audit-output/`

## Notes

- This root README intentionally does not document JetScope release/sync commands; use the JetScope project README/OPERATIONS files from the project checkout instead.
- Shared reusable script infrastructure lives in `~/tools/script-core/`.
- Root push remains blocked unless root-vs-JetScope remote divergence is explicitly reconciled and approved.
