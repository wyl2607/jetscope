#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "sync-check: not inside a git worktree" >&2
  exit 2
fi

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "sync-check: detached HEAD" >&2
  exit 2
fi

git fetch origin --prune

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "$upstream" ]; then
  upstream="origin/$branch"
  if ! git rev-parse --verify --quiet "$upstream" >/dev/null; then
    echo "sync-check: no upstream configured and $upstream does not exist" >&2
    exit 2
  fi
fi

counts="$(git rev-list --left-right --count "HEAD...$upstream")"
ahead="${counts%%[[:space:]]*}"
behind="${counts##*[[:space:]]}"

echo "branch: $branch"
echo "upstream: $upstream"
echo "ahead: $ahead"
echo "behind: $behind"

if [ -n "$(git status --porcelain)" ]; then
  echo "worktree: dirty"
  git status --short
else
  echo "worktree: clean"
fi

if [ "$behind" -ne 0 ]; then
  echo "sync-check: local branch is behind $upstream; sync before development" >&2
  exit 1
fi

if [ "$ahead" -ne 0 ]; then
  echo "sync-check: local branch is ahead of $upstream; push or coordinate before switching machines" >&2
fi
