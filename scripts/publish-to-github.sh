#!/bin/bash
# JetScope 发布脚本 — 直接推送到 GitHub
# 用法: ./scripts/publish-to-github.sh
#
# 变更: 本地 SAF-signal/ 目录已废弃，jetscope/ 直接作为 GitHub 发布源

set -e

SRC="/Users/yumei/projects/jetscope/"

echo "=== JetScope Publish to GitHub ==="
echo "Source: $SRC"
echo "Remote: wyl2607/jetscope.git"
echo ""

cd "$SRC"

# 1. Verify build
echo "[1/3] Verifying build..."
npm run web:gate
echo "[1/3] ✅ Build passes"
echo ""

# 2. Verify .gitignore excludes sensitive files
echo "[2/3] Verifying .gitignore exclusions..."
if git ls-files | grep -qE "\.env$|\.env\.local$|\.env\.webhook$"; then
  echo "❌ ERROR: Sensitive files detected in git index!"
  git ls-files | grep -E "\.env$|\.env\.local$|\.env\.webhook$"
  exit 1
fi
echo "[2/3] ✅ No sensitive files in index"
echo ""

# 3. Commit and push
echo "[3/3] Pushing to GitHub..."
git add -A
if git diff --cached --quiet; then
  echo "[3/3] ℹ️ No changes to commit"
else
  git commit -m "publish: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin main
  echo "[3/3] ✅ Pushed to wyl2607/jetscope.git"
fi
echo ""

echo "=== Publish Complete ==="
