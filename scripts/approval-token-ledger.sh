#!/bin/bash

# Records approval token hashes so an approved side-effect token cannot be
# replayed accidentally or reused across action types on the same machine.

approval_token_ledger_dir() {
  if [ -n "${JETSCOPE_APPROVAL_LEDGER_DIR:-}" ]; then
    printf '%s\n' "$JETSCOPE_APPROVAL_LEDGER_DIR"
    return
  fi

  if [ "${EUID:-$(id -u)}" = "0" ]; then
    mkdir -p /var/lib/jetscope 2>/dev/null || true
  fi

  if [ -d /var/lib/jetscope ] && [ -w /var/lib/jetscope ]; then
    printf '%s\n' /var/lib/jetscope/approval-token-ledger
    return
  fi

  local git_dir
  git_dir=$(git rev-parse --git-dir 2>/dev/null || true)
  if [ -n "$git_dir" ]; then
    printf '%s\n' "$git_dir/jetscope-approval-token-ledger"
    return
  fi

  printf '%s\n' "/tmp/jetscope-approval-token-ledger-${USER:-unknown}"
}

approval_token_hash() {
  local token="$1"
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$token" | shasum -a 256 | cut -d ' ' -f 1
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$token" | sha256sum | cut -d ' ' -f 1
  else
    echo "ERROR: shasum or sha256sum is required for approval token replay protection." >&2
    return 1
  fi
}

approval_token_derive() {
  local parent_token="$1"
  local action="$2"
  local scope="$3"
  approval_token_hash "jetscope:${action}:${scope}:${parent_token}"
}

approval_token_record_once() {
  local action="$1"
  local token="$2"
  local scope="${3:-}"
  local dir hash path tmp

  if [ -z "$token" ]; then
    echo "ERROR: approval token for $action is empty." >&2
    return 1
  fi

  dir=$(approval_token_ledger_dir) || return 1
  mkdir -p "$dir" || {
    echo "ERROR: cannot create approval token ledger: $dir" >&2
    return 1
  }

  hash=$(approval_token_hash "$token") || return 1
  path="$dir/$hash.used"
  if [ -e "$path" ]; then
    echo "ERROR: approval token was already used; generate a fresh token for $action." >&2
    return 1
  fi

  if ! mkdir "$path" 2>/dev/null; then
    echo "ERROR: approval token was already used; generate a fresh token for $action." >&2
    return 1
  fi

  tmp=$(mktemp "$path/.approval.XXXXXX") || return 1
  {
    printf 'timestamp=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'action=%s\n' "$action"
    printf 'scope=%s\n' "$scope"
  } > "$tmp" || {
    rm -f "$tmp"
    return 1
  }

  mv "$tmp" "$path/metadata"
}
