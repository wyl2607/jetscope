# Skill A/B Harness Fixes F1-F4

Date: 2026-05-04

## F1 - token fallback for incomplete runs

- Root cause: `runner.sh` only read token totals from `turn.completed`; relay failures, timeouts, or long interrupted sessions can exit before that event appears.
- Fix: added `extract_total_tokens`, which prefers final `turn.completed` totals when present and otherwise sums token-bearing `item.completed` / `usage` events.
- Key lines: `extract_total_tokens` handles `usage`, `payload.usage`, `item.usage`, and both snake_case / camelCase token fields.
- Evidence: fixture with no `turn.completed` returned `fallback_tokens=47`; fixture with final `turn.completed` returned `turn_completed_tokens=99`.
- Remaining risk: historical `analyze-1 NEW` log has no usage/token fields at all, so it cannot be backfilled from existing artifacts.

## F2 - writable isolated project runs

- Root cause: acceptance/refactor tasks were run under the default sandbox and hit read-only write failures, making NEW/OLD comparisons unfair.
- Fix: `acceptance-gate-development` and `quality-refactor-loop` runs now detect the first `/Users/yumei/projects/*` path, create an isolated worktree when possible, fall back to `mktemp + rsync`, rewrite the prompt to that path, pass `--sandbox workspace-write`, and retain the isolated project by default for audit.
- Key lines: `is_writable_skill`, `detect_project_path`, `prepare_writable_project`, and the `sandbox_args=(--sandbox workspace-write)` branch in `run_one`.
- Evidence: `acceptance-1` dry-run wrote logs showing isolated paths for both variants and command lines containing `--sandbox workspace-write`; live project paths in the prompt were rewritten to temp project paths.
- Remaining risk: in this CLI sandbox, `git worktree add` against `/Users/yumei/projects/sustainos` could not update source repo metadata, so the verified path used the `rsync` fallback. Set `KEEP_ISOLATED_PROJECTS=0` to clean isolated projects automatically instead of retaining them for audit.

## F3 - normalized stop-signal matching

- Root cause: literal `grep -F "$stop_signal"` missed case changes and markdown/quote decoration such as `*analysis complete*`.
- Fix: added `normalize_stream` and `stop_signal_hit`; matching now strips `*`, `_`, quotes, and backticks, then uses case-insensitive fixed matching.
- Key lines: `normalize_stream` and `stop_signal_hit`.
- Evidence: fixture `final: "*analysis complete*"` returns `normalized_stop=1`, while the previous literal grep returns `old_literal=0`.

## F4 - network invalid classification and retry

- Root cause: relay disconnects after repeated reconnect attempts were written as ordinary failed runs with zero tokens/calls.
- Fix: added `invalid_reason` CSV column, `invalid_reason_for`, and one automatic retry for `network` invalid runs. The retained audit row records `network`, `timeout`, `other`, or empty.
- Key lines: CSV header includes `invalid_reason`; `run_one` retry loop writes `skill-ab: retrying after network invalid attempt 1/2`.
- Evidence: `results-fix-verify.csv` from `plan-1` has `invalid_reason=network` for both variants during current relay outage, and each session log shows two rounds of `Reconnecting... 1/5` through `5/5` with the retry marker.

## Validation Run

- `bash -n runner.sh`: passed.
- `python3 -m py_compile verdict.py`: passed.
- Required dry-run command with `--limit 1`: passed and wrote `/tmp/skill-ab-required-dry.csv`.
- Single true run command for `plan-1`: completed as invalid due to relay network failure, wrote `results-fix-verify.csv`, and verified the new `invalid_reason` column plus retry behavior.
