#!/usr/bin/env bash
# skill-ab/runner.sh — A/B compare optimized skills (NEW) vs prior versions (OLD).
#
# Usage:
#   bash runner.sh --tasks tasks.jsonl --new ~/vibecoding/.codex/skills --old ~/vibecoding/.codex/skills.bak [--out results-$(date +%Y%m%d-%H%M).csv] [--limit 8] [--dry-run]
#
# Requires: codex CLI 0.128+, jq, python3.
# Safety: runs each variant in an isolated temporary CODEX_HOME. It must not mutate the live skills directory.
# Per-task output: total_tokens, tool_calls (best-effort), wall_seconds, stop_signal_hit (0/1), artifact_present (0/1), invalid_reason.

set -euo pipefail

TASKS=""
NEW_DIR=""
OLD_DIR=""
OUT="results-$(date +%Y%m%d-%H%M%S).csv"
LIMIT=""
DRY=0
TIMEOUT=900   # 15 min hard cap per task
NETWORK_RETRY_SLEEP="${NETWORK_RETRY_SLEEP:-30}"
NETWORK_MAX_ATTEMPTS="${NETWORK_MAX_ATTEMPTS:-2}"
KEEP_ISOLATED_PROJECTS="${KEEP_ISOLATED_PROJECTS:-0}"
CODEX_BIN="${CODEX_BIN:-}"
BASE_CODEX_HOME="${BASE_CODEX_HOME:-/Users/yumei/.codex-cli-relay}"
WORK_ROOT=""
PROMPT_MAP=""
CODEX_PROVIDER_ARGS=(
  -c 'model_provider="codex"'
  -c 'model_providers.codex.base_url="https://relay.nf.video/v1/"'
  -c 'model_providers.codex.wire_api="responses"'
  -c 'model_providers.codex.requires_openai_auth=false'
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tasks)   TASKS="$2"; shift 2 ;;
    --new)     NEW_DIR="$2"; shift 2 ;;
    --old)     OLD_DIR="$2"; shift 2 ;;
    --out)     OUT="$2"; shift 2 ;;
    --limit)   LIMIT="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --prompt-map) PROMPT_MAP="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -z "$TASKS"   ]] && { echo "ERR: --tasks required" >&2; exit 2; }
[[ -z "$NEW_DIR" ]] && { echo "ERR: --new required"   >&2; exit 2; }
[[ -z "$OLD_DIR" ]] && { echo "ERR: --old required (snapshot of prior skills)" >&2; exit 2; }
[[ ! -f "$TASKS" ]] && { echo "ERR: tasks file missing: $TASKS" >&2; exit 1; }
[[ ! -d "$NEW_DIR" ]] && { echo "ERR: new skills dir missing: $NEW_DIR" >&2; exit 1; }
[[ ! -d "$OLD_DIR" ]] && { echo "ERR: old snapshot missing: $OLD_DIR" >&2; exit 4; }
[[ ! -d "$BASE_CODEX_HOME" ]] && { echo "ERR: base CODEX_HOME missing: $BASE_CODEX_HOME" >&2; exit 1; }

if [[ -z "$CODEX_BIN" ]]; then
  CODEX_BIN="/Users/yumei/.nvm/versions/node/v24.14.1/bin/codex"
fi
[[ ! -x "$CODEX_BIN" ]] && { echo "ERR: codex binary not executable: $CODEX_BIN" >&2; exit 1; }

TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="$(command -v timeout)"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="$(command -v gtimeout)"
else
  TIMEOUT_BIN="python"
fi

echo "task_id,variant,total_tokens,tool_calls,wall_seconds,stop_signal_hit,artifact_present,exit_code,invalid_reason,session_log" > "$OUT"

is_writable_skill() {
  case "$1" in
    acceptance-gate-development|quality-refactor-loop) return 0 ;;
    *) return 1 ;;
  esac
}

detect_project_path() {
  local prompt="$1"
  python3 - "$prompt" <<'PY'
import re
import sys

prompt = sys.argv[1]
matches = re.findall(r"/Users/yumei/projects/[A-Za-z0-9_.-]+", prompt)
print(matches[0] if matches else "", end="")
PY
}

prepare_writable_project() {
  local src="$1" task_id="$2" variant="$3"
  local dst
  dst="$(mktemp -d -t "skill-ab-${task_id}-${variant}-worktree-XXX")"
  if git -C "$src" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local repo_root
    repo_root="$(git -C "$src" rev-parse --show-toplevel)"
    rmdir "$dst"
    if git -C "$repo_root" worktree add --detach "$dst" HEAD >/dev/null 2>&1; then
      printf '%s' "$dst"
      return 0
    fi
    dst="$(mktemp -d -t "skill-ab-${task_id}-${variant}-copy-XXX")"
  fi
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude .git --exclude node_modules --exclude .venv --exclude __pycache__ "$src"/ "$dst"/
  else
    (cd "$src" && tar --exclude .git --exclude node_modules --exclude .venv --exclude __pycache__ -cf - .) | (cd "$dst" && tar -xf -)
  fi
  printf '%s' "$dst"
}

cleanup_writable_project() {
  local src="$1" dst="$2"
  [[ -z "$dst" || ! -d "$dst" ]] && return 0
  if [[ -n "$src" ]] && git -C "$src" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local repo_root
    repo_root="$(git -C "$src" rev-parse --show-toplevel)"
    if git -C "$repo_root" worktree list --porcelain 2>/dev/null | grep -F -q "worktree $dst"; then
      git -C "$repo_root" worktree remove --force "$dst" >/dev/null 2>&1 || rm -rf "$dst"
      return 0
    fi
    rm -rf "$dst"
  else
    rm -rf "$dst"
  fi
}

normalize_stream() {
  tr -d "*_\"\`'"
}

stop_signal_hit() {
  local stop_signal="$1"; shift
  [[ -z "$stop_signal" ]] && return 1
  local normalized_stop
  normalized_stop="$(printf '%s' "$stop_signal" | normalize_stream)"
  cat "$@" 2>/dev/null | normalize_stream | grep -F -i -q "$normalized_stop"
}

invalid_reason_for() {
  local exit_code="$1"; shift
  if grep -E -i -q 'stream disconnected|502 Bad Gateway|HTTP 502' "$@" 2>/dev/null; then
    printf '%s' "network"
  elif awk 'BEGIN{n=0; found=0} /Reconnecting/{n++; if (n >= 5) found=1; next} {n=0} END{exit found ? 0 : 1}' "$@" 2>/dev/null; then
    printf '%s' "network"
  elif [[ "$exit_code" == "124" ]]; then
    printf '%s' "timeout"
  elif [[ "$exit_code" != "0" ]]; then
    printf '%s' "other"
  else
    printf '%s' ""
  fi
}

extract_total_tokens() {
  jq -R -s -r '
    def usage_total:
      if type != "object" then empty
      else
        (.usage? // .payload?.usage? // .item?.usage? // .response?.usage?) as $u
        | if ($u | type) == "object" then
            ($u.total_tokens // $u.totalTokens //
             $u.total_token_count // $u.totalTokenCount //
             $u.total_used // $u.totalUsed //
             (($u.input_tokens // $u.inputTokens // 0) +
              ($u.prompt_tokens // $u.promptTokens // 0) +
              ($u.output_tokens // $u.outputTokens // 0) +
              ($u.completion_tokens // $u.completionTokens // 0) +
              ($u.reasoning_output_tokens // $u.reasoningOutputTokens // 0)))
          else empty end
      end;
    split("\n") | map(try fromjson catch empty) as $events
    | (
        $events
        | map(select(.type=="turn.completed") | usage_total)
        | map(select(. != null and . > 0))
        | last
      ) // (
        $events
        | map(select(.type=="item.completed" or .type=="usage" or (.usage? != null) or (.payload?.usage? != null) or (.item?.usage? != null)) | usage_total)
        | map(select(. != null and . > 0))
        | add
      ) // 0
  ' "$@" 2>/dev/null || echo 0
}

extract_tool_calls() {
  jq -R -s -r '
    split("\n") | map(try fromjson catch empty) |
    map(
      if (.type=="exec_command" or .type=="function_call" or .type=="tool_call") then 1
      elif (.payload.type=="function_call" or .payload.type=="tool_call") then 1
      elif (.type=="item.completed" and .item.type=="command_execution") then 1
      else 0 end
    ) | add // 0
  ' "$@" 2>/dev/null || echo 0
}

rewrite_prompt() {
  local text="$1"
  [[ -z "$PROMPT_MAP" ]] && { printf '%s' "$text"; return 0; }
  python3 - "$PROMPT_MAP" "$text" <<'PY'
import json
import sys

mapping = json.loads(sys.argv[1])
text = sys.argv[2]
for src, dst in mapping.items():
    text = text.replace(src, dst)
print(text, end="")
PY
}

prepare_home() {
  local variant="$1" skills_src="$2" home="$3"
  mkdir -p "$home"
  for item in auth.json config.toml version.json installation_id rules memories .omx; do
    if [[ -e "$BASE_CODEX_HOME/$item" ]]; then
      cp -R "$BASE_CODEX_HOME/$item" "$home/$item"
    fi
  done
  cp -R "$skills_src" "$home/skills"
  printf '%s\n' "$variant" > "$home/.skill-ab-variant"
}

run_one() {
  local task_id="$1" variant="$2" skill="$3" prompt="$4" stop_signal="$5" artifacts_csv="$6" codex_home="$7"
  local logf="$(mktemp -t skill-ab-${task_id}-${variant}-XXX.log)"
  local jsonf="$(mktemp -t skill-ab-${task_id}-${variant}-XXX.json)"
  local artifact_dir="/tmp/skill-ab-artifacts/${task_id}-${variant}"
  local skill_file="$codex_home/skills/$skill/SKILL.md"
  local run_cwd="$artifact_dir"
  local project_src=""
  local writable_project=""
  local invalid_reason=""
  local sandbox_args=()
  local a_trim=""
  mkdir -p "$artifact_dir"
  [[ ! -f "$skill_file" ]] && { echo "ERR: skill missing for $variant/$skill: $skill_file" >&2; return 1; }

  if is_writable_skill "$skill"; then
    project_src="$(detect_project_path "$prompt")"
    if [[ -n "$project_src" && -d "$project_src" ]]; then
      writable_project="$(prepare_writable_project "$project_src" "$task_id" "$variant")"
      run_cwd="$writable_project"
      prompt="${prompt//$project_src/$writable_project}"
      artifact_dir="$writable_project/.skill-ab-artifacts"
      mkdir -p "$artifact_dir"
      sandbox_args=(--sandbox workspace-write)
      {
        echo "skill-ab: writable skill '$skill' isolated from $project_src"
        echo "skill-ab: writable project path: $writable_project"
      } >> "$logf"
    else
      echo "WARN: writable skill '$skill' had no existing /Users/yumei/projects/* path; using artifact cwd: $artifact_dir" >> "$logf"
      sandbox_args=(--sandbox workspace-write)
    fi
  elif [[ "$prompt" == *"/private/tmp/skill-ab-projects-full/sustainos"* ]]; then
    run_cwd="/private/tmp/skill-ab-projects-full/sustainos"
  elif [[ "$prompt" == *"/private/tmp/skill-ab-projects-full/esg-research-toolkit"* ]]; then
    run_cwd="/private/tmp/skill-ab-projects-full/esg-research-toolkit"
  fi

  local start=$SECONDS
  local exit_code=0
  prompt="${prompt//\/Users\/yumei\/vibecoding\/.codex\/skills/$codex_home/skills}"
  local skill_body
  skill_body="$(cat "$skill_file")"
  local marked_prompt="Skill under test: ${skill}
Variant: ${variant}

Follow this SKILL.md content as the only workflow skill for this task:

---BEGIN SKILL UNDER TEST---
${skill_body}
---END SKILL UNDER TEST---

${prompt}

A/B harness constraints:
- Use the ${skill} skill and do not switch to a different workflow skill.
- Do not open, read, grep, or cite the live user skill directory. The full skill under test is already embedded above from the isolated ${variant} home.
- Keep discovery bounded: no more than 3 search commands, 5 file excerpts, and 2 validation commands unless required to avoid a wrong answer.
- Do not edit files unless this task explicitly asks for edits."
	  marked_prompt="${marked_prompt}"$'\n'"- If this task asks you to create a helper, validator, report, or temporary artifact but does not give an explicit allowed path, write it only under ${artifact_dir}."
	  marked_prompt="${marked_prompt}"$'\n'"- If this task names an isolated project path and then gives relative allowed paths, treat those relative paths as rooted at that isolated project."
	  marked_prompt="${marked_prompt}"$'\n'"- If copied project docs mention live paths under /Users/yumei/projects, translate those references to the isolated project cwd for this run. Do not read from or write to live /Users/yumei/projects repositories."
  if [[ -n "$stop_signal" ]]; then
    marked_prompt="${marked_prompt}"$'\n\n'"End your final answer with this exact marker on its own line: ${stop_signal}"
  fi
  if [[ $DRY -eq 1 ]]; then
    echo "[dry] CODEX_HOME=$codex_home $CODEX_BIN ${CODEX_PROVIDER_ARGS[*]} exec --ignore-rules --json --skip-git-repo-check ${sandbox_args[*]-} -C $run_cwd -o $jsonf -- '$marked_prompt'" >> "$logf"
    sleep 1
  else
    local attempt=1
    while (( attempt <= NETWORK_MAX_ATTEMPTS )); do
      if (( attempt > 1 )); then
        echo "skill-ab: retrying after network invalid attempt $((attempt - 1))/${NETWORK_MAX_ATTEMPTS}" >> "$logf"
        sleep "$NETWORK_RETRY_SLEEP"
      fi
      if [[ "$TIMEOUT_BIN" == "python" ]]; then
        CODEX_HOME="$codex_home" python3 - "$TIMEOUT" "$CODEX_BIN" "$jsonf" "$marked_prompt" "$run_cwd" ${sandbox_args[@]+"${sandbox_args[@]}"} >> "$logf" 2>&1 <<'PY' || exit_code=$?
import os
import signal
import subprocess
import sys

timeout_s = int(sys.argv[1])
codex_bin = sys.argv[2]
jsonf = sys.argv[3]
prompt = sys.argv[4]
run_cwd = sys.argv[5]
sandbox_args = sys.argv[6:]
provider_args = [
    "-c", 'model_provider="codex"',
    "-c", 'model_providers.codex.base_url="https://relay.nf.video/v1/"',
    "-c", 'model_providers.codex.wire_api="responses"',
    "-c", 'model_providers.codex.requires_openai_auth=false',
]
cmd = [codex_bin, *provider_args, "exec", "--ignore-rules", "--json", "--skip-git-repo-check", *sandbox_args, "-C", run_cwd, "-o", jsonf, "--", prompt]
try:
    proc = subprocess.Popen(cmd, start_new_session=True)
    raise SystemExit(proc.wait(timeout=timeout_s))
except subprocess.TimeoutExpired:
    print(f"ERR: timed out after {timeout_s}s: {' '.join(cmd[:5])} ...", file=sys.stderr)
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=5)
    except Exception:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except Exception:
            pass
    raise SystemExit(124)
PY
      else
        CODEX_HOME="$codex_home" "$TIMEOUT_BIN" "$TIMEOUT" "$CODEX_BIN" "${CODEX_PROVIDER_ARGS[@]}" exec --ignore-rules --json --skip-git-repo-check ${sandbox_args[@]+"${sandbox_args[@]}"} \
          -C "$run_cwd" -o "$jsonf" -- "$marked_prompt" >> "$logf" 2>&1 || exit_code=$?
      fi
      invalid_reason="$(invalid_reason_for "$exit_code" "$logf" "$jsonf")"
      [[ "$invalid_reason" == "network" && $attempt -lt $NETWORK_MAX_ATTEMPTS ]] || break
      exit_code=0
      attempt=$((attempt + 1))
    done
  fi
  local wall=$((SECONDS - start))

  # Extract metrics from json log (best-effort; fields vary by codex version).
  local tokens=0 toolcalls=0
  tokens="$(extract_total_tokens "$logf" "$jsonf")"
  toolcalls="$(extract_tool_calls "$logf" "$jsonf")"
  [[ -z "$invalid_reason" ]] && invalid_reason="$(invalid_reason_for "$exit_code" "$logf" "$jsonf")"

  local stop_hit=0
  if stop_signal_hit "$stop_signal" "$logf" "$jsonf"; then stop_hit=1; fi
  # Artifact heuristic: any of the comma-separated tokens appears in the log.
  local artifact_hit=0
  IFS=',' read -ra arts <<< "$artifacts_csv"
  for a in "${arts[@]}"; do
    a_trim="$(echo "$a" | xargs)"
    [[ -z "$a_trim" ]] && continue
    if grep -F -i -q "$a_trim" "$logf" "$jsonf" 2>/dev/null; then artifact_hit=1; break; fi
  done

  echo "${task_id},${variant},${tokens},${toolcalls},${wall},${stop_hit},${artifact_hit},${exit_code},${invalid_reason},${logf}" >> "$OUT"
  if [[ "$KEEP_ISOLATED_PROJECTS" == "1" && -n "$writable_project" ]]; then
    echo "skill-ab: retained isolated project for audit: $writable_project" >> "$logf"
  else
    cleanup_writable_project "$project_src" "$writable_project"
  fi
}

cleanup() {
  [[ -n "$WORK_ROOT" && -d "$WORK_ROOT" ]] && rm -rf "$WORK_ROOT"
}
trap cleanup EXIT INT TERM

WORK_ROOT="$(mktemp -d -t skill-ab-home-XXX)"
NEW_HOME="$WORK_ROOT/new-home"
OLD_HOME="$WORK_ROOT/old-home"
prepare_home "NEW" "$NEW_DIR" "$NEW_HOME"
prepare_home "OLD" "$OLD_DIR" "$OLD_HOME"

# Iterate tasks
n=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  n=$((n+1))
  [[ -n "$LIMIT" && $n -gt $LIMIT ]] && break
  id=$(echo "$line"     | jq -r '.id')
  skill=$(echo "$line"  | jq -r '.skill')
  prompt=$(echo "$line" | jq -r '.prompt')
  prompt="$(rewrite_prompt "$prompt")"
  stop=$(echo "$line"   | jq -r '.expected_stop_signal // ""')
  arts=$(echo "$line"   | jq -r '.expected_artifacts // [] | join(",")')

  echo "[$(date +%H:%M:%S)] task ${id} -- NEW"
  run_one "$id" "NEW" "$skill" "$prompt" "$stop" "$arts" "$NEW_HOME"

  echo "[$(date +%H:%M:%S)] task ${id} -- OLD"
  run_one "$id" "OLD" "$skill" "$prompt" "$stop" "$arts" "$OLD_HOME"
done < "$TASKS"

echo
echo "Wrote: $OUT"
echo "Verdict next: python3 $(dirname "$0")/verdict.py $OUT"
