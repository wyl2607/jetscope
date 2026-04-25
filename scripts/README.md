# Root Workspace Scripts

This directory contains `/Users/yumei` workspace-level governance and operations helpers. It is not a project application script directory.

## Safety Rules

- Read-only checks may run locally.
- Commands that install, update, sync, deploy, clean remote state, or touch VPS/control-plane nodes require explicit approval.
- Do not commit generated reports, logs, credentials, shell history, AI runtime state, or project runtime artifacts from this root repo.
- Project-specific release/sync scripts live inside their project directories, for example `projects/jetscope/scripts/`.

## Current Source Candidates

- `daily_ai_tools_update_check.py`: read-only AI tool and node health report generator. It probes local/remote tool versions, applies VPS policy checks, writes local runtime reports under `tools/automation/runtime/`, and does not remediate state.
- `ops_hub.sh`: local orchestration wrapper for daily/weekly profiles. The default daily profile refreshes the AI systems registry, runs the daily AI tools check, and writes an ops journal.
- `internal_device_update_orchestrator.py`: high-risk AI tool updater for internal devices. Use `--dry-run` for review; real update runs can change local or remote tool installations and require explicit approval. VPS targets are blocked unless both `--include-vps` and `ALLOW_VPS_AI_TOOL_INSTALL=1` are set after approval.
- `probe-gpt55-authenticity.sh`: relay anti-spoof probe for `gpt-5.5` using Responses API behavior, negative controls, sampling, and optional official OpenAI A/B comparison.
- Obsidian helper scripts are local/private source candidates. They default to dry-run and must not be run with `--apply` without explicit approval.

## Common Read-Only Checks

```bash
python3 /Users/yumei/scripts/daily_ai_tools_update_check.py
bash /Users/yumei/scripts/ops_hub.sh run-profile daily
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets local --dry-run --print-json
bash /Users/yumei/scripts/probe-gpt55-authenticity.sh --help
```

## High-Risk Operations

These are not default checks:

```bash
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --verify-after
python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets mac-mini,coco,windows-pc --verify-after
python3 /Users/yumei/scripts/obsidian_vault_cleanup_apply.py --apply
python3 /Users/yumei/scripts/obsidian_vault_inbox_stub_cleanup.py --apply
python3 /Users/yumei/scripts/obsidian_vault_inbox_topic_route.py --apply
```

Run them only after confirming the intended target set and approval boundary.

## Output Locations

- AI tools reports: `tools/automation/runtime/ai-tools-update-check/`
- Internal device update reports: `tools/automation/runtime/internal-device-updates/`
- Ops daily journal: `tools/automation/runtime/ops-daily-journal/`
- GPT probe reports: `gpt55-probe-report-*.json` in the current working directory unless `--out` is provided.
- Obsidian audit/repair reports: `obsidian-audit-output/`

## Notes

- This root README intentionally does not document JetScope release/sync commands; use the JetScope project README/OPERATIONS files from the project checkout instead.
- Shared reusable script infrastructure lives in `~/tools/script-core/`.
- Root push remains blocked unless root-vs-JetScope remote divergence is explicitly reconciled and approved.
