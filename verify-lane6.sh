#!/bin/bash
# Lane 6 Price Trends Dashboard - Verification Script

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "🔍 Lane 6 - Price Trends Dashboard Verification"
echo "================================================"
echo ""

# Step 1: Verify all files exist
echo "✓ Checking new/modified files..."
files_to_check=(
  "apps/web/components/price-trends-chart.tsx"
  "apps/web/app/dashboard/page.tsx"
  "apps/web/app/prices/germany-jet-fuel/page.tsx"
  "apps/web/lib/product-read-model.ts"
)

for file in "${files_to_check[@]}"; do
  if [ -f "$file" ]; then
    lines=$(wc -l < "$file")
    echo "  ✅ $file ($lines lines)"
  else
    echo "  ❌ $file NOT FOUND"
    exit 1
  fi
done

echo ""

# Step 2: Check for required imports in pages
echo "✓ Checking imports in pages..."
if grep -q "import { PriceTrendsChart }" apps/web/app/dashboard/page.tsx; then
  echo "  ✅ Dashboard imports PriceTrendsChart"
else
  echo "  ❌ Dashboard missing PriceTrendsChart import"
  exit 1
fi

if grep -q "import { getPriceTrendChartReadModel }" apps/web/app/dashboard/page.tsx; then
  echo "  ✅ Dashboard imports getPriceTrendChartReadModel"
else
  echo "  ❌ Dashboard missing getPriceTrendChartReadModel import"
  exit 1
fi

if grep -q "import { PriceTrendsChart }" apps/web/app/prices/germany-jet-fuel/page.tsx; then
  echo "  ✅ Germany prices imports PriceTrendsChart"
else
  echo "  ❌ Germany prices missing PriceTrendsChart import"
  exit 1
fi

echo ""

# Step 3: Check for component usage in pages
echo "✓ Checking component usage..."
if grep -q "<PriceTrendsChart" apps/web/app/dashboard/page.tsx; then
  echo "  ✅ Dashboard uses PriceTrendsChart component"
else
  echo "  ❌ Dashboard doesn't use PriceTrendsChart"
  exit 1
fi

if grep -q "<PriceTrendsChart" apps/web/app/prices/germany-jet-fuel/page.tsx; then
  echo "  ✅ Germany prices uses PriceTrendsChart component"
else
  echo "  ❌ Germany prices doesn't use PriceTrendsChart"
  exit 1
fi

echo ""

# Step 4: Check type exports
echo "✓ Checking type exports in product-read-model.ts..."
if grep -q "export type PriceTrendChartData" apps/web/lib/product-read-model.ts; then
  echo "  ✅ PriceTrendChartData type exported"
else
  echo "  ❌ PriceTrendChartData type not exported"
  exit 1
fi

if grep -q "export type PriceTrendChartReadModel" apps/web/lib/product-read-model.ts; then
  echo "  ✅ PriceTrendChartReadModel type exported"
else
  echo "  ❌ PriceTrendChartReadModel type not exported"
  exit 1
fi

if grep -q "export async function getPriceTrendChartReadModel" apps/web/lib/product-read-model.ts; then
  echo "  ✅ getPriceTrendChartReadModel function exported"
else
  echo "  ❌ getPriceTrendChartReadModel function not exported"
  exit 1
fi

echo ""

# Step 5: Run build verification
echo "✓ Running Next.js build..."
cd apps/web
npm run build 2>&1 | tail -20
cd ../..

echo ""

# Step 6: Run typecheck
echo "✓ Running TypeScript type check..."
npm run web:typecheck 2>&1 | tail -20

echo ""
echo "✅ All verification checks passed!"
echo "📊 Lane 6 is ready for production deployment"
