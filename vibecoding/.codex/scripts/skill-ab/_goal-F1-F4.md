# YOUR ONLY TASK: Fix runner.sh and verdict.py in this directory

**Repository under your cursor**: `/Users/yumei/vibecoding/.codex/scripts/skill-ab/`
**Files you may edit**:
- `runner.sh` (currently 253 lines, ~10 KB)
- `verdict.py` (currently 95 lines)
- create new: `CHANGELOG-F1-F4.md`

**Files you must NOT touch**: anything outside this directory. Do NOT explore `lca_engine/`, `tests/`, `~/projects/`, `~/AGENTS.md`, `dev-harness/`, or any other repo. Ignore prior context that mentioned `test_lca_evidence_pack` or `test_lca_store_refactor_gate`; those are NOT your task.

**Do not invoke any skill**. Do not run `ai-trace.sh`. Do not read `INDEX.md` or `AGENTS.md`. Do not call apply_acceptance gates. Just edit two files.

---

## Background (read once, do not re-explore)

`runner.sh` runs an A/B test of skill versions. It calls `codex exec` with each variant and parses the JSONL stream output to extract metrics. There are 4 known bugs to fix:

### Bug F1 — token field is 0 when run exits non-zero
- Symptom: `results-*.csv` shows `total_tokens=0` for runs that actually used tokens.
- Cause hypothesis: parser only reads token count from a `turn.completed` event; if the run times out or errors first, the field is never set.
- Fix: while parsing the JSONL stream, extract token counts from any `usage`-bearing event AND from per-`item.completed` cumulative counters when present. Always emit whatever was last seen, even on non-zero exit.

### Bug F2 — acceptance/refactor tasks blocked by read-only sandbox
- Symptom: log shows `operation not permitted` when codex tries to create a test file inside `/Users/yumei/projects/sustainos/...`.
- Cause: runner does not give those task types a writable workspace.
- Fix: when the task's `skill` field equals `acceptance-gate-development` or `quality-refactor-loop`, set up an isolated writable workspace before invoking codex:
  - if the project path is in a git repo: `git -C <project> worktree add <tmpdir> HEAD`
  - else: `mktemp -d` + `rsync -a <project>/ <tmpdir>/`
  - pass `--cd <tmpdir>` to `codex exec` (instead of the original project path)
  - clean up the worktree/tmpdir after the run
  - other skill types: keep current behavior (read-only is fine for `analyze` and `plan`)

### Bug F3 — stop_signal_hit detection misses formatted output
- Symptom: model emits `**ANALYSIS COMPLETE**` or `analysis complete` but parser uses exact-case `grep -F "ANALYSIS COMPLETE"`.
- Fix: strip markdown decoration (`*`, `_`, backticks) and quotes from the matched line, lowercase both sides, then compare.

### Bug F4 — relay network failures pollute results
- Symptom: when relay drops the stream (5 retries fail, `turn.failed`), the run is recorded as `tokens=0, calls=0, exit=1` and counted as a valid sample.
- Fix:
  - add a new column `invalid_reason` to the CSV header (after `exit_code`, before `session_log`); legal values: `""` (valid), `network`, `timeout`, `other`.
  - detect `stream disconnected` or 5 consecutive `Reconnecting` events in the run log → mark `invalid_reason=network`.
  - when invalid_reason=network, retry the run ONCE after a 30-second sleep before giving up.

---

## Required deliverables

1. Edits applied to `runner.sh` and (if needed) `verdict.py`.
2. New file `CHANGELOG-F1-F4.md` listing per-bug: hypothesis, key diff lines (filename + line numbers), how to verify.
3. Run these checks and paste outputs into your final message:
   - `bash -n /Users/yumei/vibecoding/.codex/scripts/skill-ab/runner.sh`
   - `python3 -m py_compile /Users/yumei/vibecoding/.codex/scripts/skill-ab/verdict.py`
   - `bash /Users/yumei/vibecoding/.codex/scripts/skill-ab/runner.sh --tasks /Users/yumei/vibecoding/.codex/scripts/skill-ab/tasks.jsonl --new ~/vibecoding/.codex/skills --old ~/vibecoding/.codex/skills.bak --limit 1 --dry-run` (must succeed without invoking the model)

## Forbidden

- DO NOT push, commit, or modify git config.
- DO NOT touch any file outside `/Users/yumei/vibecoding/.codex/scripts/skill-ab/`.
- DO NOT run any A/B real-task call against the relay (no actual model invocations beyond `--dry-run`).
- DO NOT invoke any other skill or sub-agent. Just edit text files.

When done, print `F1-F4 FIX COMPLETE` and stop.
