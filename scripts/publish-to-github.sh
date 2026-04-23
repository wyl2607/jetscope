#!/bin/bash
# SAF 发布脚本 — 从 SAFvsOil 去敏后同步到 SAF-signal，验证并 push 到 GitHub
# 用法: ./scripts/publish-to-github.sh

set -e

SRC="/Users/yumei/SAFvsOil/"
DEST="/Users/yumei/projects/SAF-signal/"

echo "=== SAF Publish to GitHub ==="
echo "Source: $SRC"
echo "Dest:   $DEST"
echo ""

# 1. Sync production code to SAF-signal (sanitized)
echo "[1/4] Syncing production code (sanitized)..."

rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='apps/web/.next' \
  --exclude='apps/web/dist' \
  --exclude='apps/api/.venv' \
  --exclude='.omx' \
  --exclude='.automation' \
  --exclude='test-results' \
  --exclude='*.tar.gz' \
  --exclude='apps/web/tsconfig.tsbuildinfo' \
  --exclude='apps/web/next-env.d.ts' \
  --exclude='.env.webhook' \
  --exclude='.env.api-keys' \
  --exclude='scripts/auto-sync-cluster.sh' \
  --exclude='docs/archived/' \
  --exclude='PROJECT_PROGRESS*.md' \
  --exclude='DAY*_*' \
  --exclude='EXECUTE*' \
  --exclude='SAF_DEVELOPMENT_ANALYSIS_REPORT.md' \
  --exclude='scripts/deploy/' \
  --exclude='scripts/verify/' \
  "$SRC" "$DEST"

echo "[1/4] ✅ Sync complete"
echo ""

# 2. Verify build
echo "[2/4] Verifying build..."
cd "$DEST"
npm run web:gate
echo "[2/4] ✅ Build passes"
echo ""

# 3. Commit
echo "[3/4] Committing changes..."
cd "$DEST"
git add -A
if git diff --cached --quiet; then
  echo "[3/4] ⚠️  No changes to commit"
  exit 0
fi

git commit -m "sync: production update from SAFvsOil ($(date +%Y-%m-%d %H:%M))"
echo "[3/4] ✅ Committed"
echo ""

# 4. Push to GitHub
echo "[4/4] Pushing to GitHub..."

# Temporarily disable global insteadOf to allow HTTPS push
GITCONFIG_BACKUP=""
if git config --global --get url.git@github.com:.insteadof >/dev/null 2>&1; then
  cp ~/.gitconfig ~/.gitconfig.bak
  GITCONFIG_BACKUP="1"
  sed -i '' '/insteadOf/d' ~/.gitconfig
fi

PUSH_OK="0"
if git -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push https://github.com/wyl2607/SAF-signal.git main; then
  PUSH_OK="1"
fi

# Restore gitconfig
if [[ -n "$GITCONFIG_BACKUP" ]]; then
  cp ~/.gitconfig.bak ~/.gitconfig
  rm ~/.gitconfig.bak
fi

if [[ "$PUSH_OK" == "1" ]]; then
  echo "[4/4] ✅ Pushed to https://github.com/wyl2607/SAF-signal"
else
  echo "[4/4] ❌ Push failed"
  echo "Hint: Run 'gh auth login' if token expired"
  exit 1
fi

echo ""
echo "=== Publish complete ==="
