#!/bin/bash
# Quick setup script - Copy & paste this entire block into your terminal

set -e

echo "🚀 Setting up FAQ page..."

# Create the faq directory
mkdir -p /Users/yumei/SAFvsOil/apps/web/app/faq

# Copy the FAQ content from temporary file to its final location
cp /Users/yumei/SAFvsOil/apps/web/app/_faq_page_temp.tsx \
   /Users/yumei/SAFvsOil/apps/web/app/faq/page.tsx

echo "✅ FAQ page created at: /Users/yumei/SAFvsOil/apps/web/app/faq/page.tsx"

# Verify the file exists
if [ -f "/Users/yumei/SAFvsOil/apps/web/app/faq/page.tsx" ]; then
  echo "✅ File verified successfully"
  wc -l /Users/yumei/SAFvsOil/apps/web/app/faq/page.tsx
else
  echo "❌ File creation failed"
  exit 1
fi

# Type check
echo ""
echo "📋 Running TypeScript type check..."
cd /Users/yumei/SAFvsOil/apps/web
npm run typecheck

# Build
echo ""
echo "🏗️  Building application..."
npm run build

echo ""
echo "✅ All done! Your FAQ page is ready at: /faq"
echo ""
echo "Next steps:"
echo "1. Review: git diff apps/web/app/sitemap.ts apps/web/app/faq/"
echo "2. Commit: See COMPLETION_REPORT.md for git commit command"
echo "3. Deploy: Push to production"
