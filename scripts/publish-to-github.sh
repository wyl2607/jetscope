#!/bin/bash

set -euo pipefail

ROOT="/Users/yumei/projects/jetscope"
BUS_WRITE="/Users/yumei/tools/script-core/bin/sc-bus-write"
PRODUCER="jetscope/scripts/publish-to-github.sh"
REMOTE_NAME="origin"
BRANCH_NAME="main"
SECURITY_CHECK="$ROOT/scripts/security_check.sh"
REVIEW_PUSH_GUARD="$ROOT/scripts/review_push_guard.sh"

emit_event() {
  local status="$1"
  local summary="$2"
  local error_text="${3:-}"
  local commit_before="${4:-}"
  local commit_after="${5:-}"
  local payload
  payload=$(cat <<EOF
{"project":"jetscope","source_path":"$ROOT","remote":"wyl2607/jetscope.git","git_ref":"$BRANCH_NAME","status":"$status","commit_before":"$commit_before","commit_after":"$commit_after","summary":"$summary","error":"$error_text"}
EOF
)
  "$BUS_WRITE" publish-event --key "jetscope-main" --producer "$PRODUCER" --payload "$payload" >/dev/null || true
}

run_push_gates() {
  check_push_gates_exist
  "$SECURITY_CHECK"
  "$REVIEW_PUSH_GUARD" "$REMOTE_NAME/$BRANCH_NAME"
}

check_push_gates_exist() {
  if [ ! -x "$SECURITY_CHECK" ]; then
    echo "ERROR: Missing required push gate: $SECURITY_CHECK" >&2
    emit_event "failed" "missing push gate" "$SECURITY_CHECK" "$COMMIT_BEFORE" "$COMMIT_BEFORE"
    exit 1
  fi
  if [ ! -x "$REVIEW_PUSH_GUARD" ]; then
    echo "ERROR: Missing required push gate: $REVIEW_PUSH_GUARD" >&2
    emit_event "failed" "missing push gate" "$REVIEW_PUSH_GUARD" "$COMMIT_BEFORE" "$COMMIT_BEFORE"
    exit 1
  fi
}

cd "$ROOT"

COMMIT_BEFORE="$(git rev-parse HEAD 2>/dev/null || true)"
emit_event "started" "publish started" "" "$COMMIT_BEFORE" ""

echo "=== JetScope Publish ==="
echo "Repo: $ROOT"

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
  echo "ERROR: Publish must run from $BRANCH_NAME; current branch is '${CURRENT_BRANCH:-detached HEAD}'." >&2
  emit_event "failed" "wrong publish branch" "current branch ${CURRENT_BRANCH:-detached HEAD}" "$COMMIT_BEFORE" "$COMMIT_BEFORE"
  exit 1
fi

# Strict: fail if working tree is dirty (uncommitted changes or untracked files)
DIRTY_TRACKED=0
DIRTY_STAGED=0
DIRTY_UNTRACKED=0

if ! git diff --quiet; then
  DIRTY_TRACKED=1
fi
if ! git diff --cached --quiet; then
  DIRTY_STAGED=1
fi
if [ -n "$(git ls-files --others --exclude-standard)" ]; then
  DIRTY_UNTRACKED=1
fi

if [ "$DIRTY_TRACKED" -eq 1 ] || [ "$DIRTY_STAGED" -eq 1 ] || [ "$DIRTY_UNTRACKED" -eq 1 ]; then
  REASON=""
  [ "$DIRTY_TRACKED" -eq 1 ] && REASON="${REASON}modified tracked files; "
  [ "$DIRTY_STAGED" -eq 1 ] && REASON="${REASON}staged changes; "
  [ "$DIRTY_UNTRACKED" -eq 1 ] && REASON="${REASON}untracked files; "
  echo "ERROR: Working tree is dirty. ${REASON}Commit or stash before publishing."
  emit_event "failed" "working tree dirty" "${REASON}" "$COMMIT_BEFORE" "$COMMIT_BEFORE"
  exit 1
fi

check_push_gates_exist
npm run web:gate
run_push_gates

# Verify local is ahead of remote (something to push)
LOCAL_COMMIT="$(git rev-parse HEAD)"
REMOTE_COMMIT="$(git rev-parse "$REMOTE_NAME/$BRANCH_NAME" 2>/dev/null || echo "")"

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
  emit_event "skipped" "no commits to push" "" "$COMMIT_BEFORE" "$COMMIT_BEFORE"
  echo "No new commits to publish"
  exit 0
fi

git push "$REMOTE_NAME" "HEAD:refs/heads/$BRANCH_NAME"

# Verify remote now matches what we intended to push
PUSHED_COMMIT="$(git rev-parse HEAD)"
REMOTE_NOW="$(git ls-remote "$REMOTE_NAME" "$BRANCH_NAME" | awk '{print $1}')"

if [ "$PUSHED_COMMIT" != "$REMOTE_NOW" ]; then
  echo "ERROR: Remote commit ($REMOTE_NOW) does not match local commit ($PUSHED_COMMIT) after push."
  emit_event "failed" "remote verification failed" "remote $REMOTE_NOW != local $PUSHED_COMMIT" "$COMMIT_BEFORE" "$PUSHED_COMMIT"
  exit 1
fi

emit_event "success" "publish completed" "" "$COMMIT_BEFORE" "$PUSHED_COMMIT"

echo "Publish complete: $PUSHED_COMMIT"
