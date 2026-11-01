const fs = require('fs');

const file = 'apps/web/lib/navigation.ts';
let content = fs.readFileSync(file, 'utf-8');

// Update labels for the ones that need it
content = content.replace(/label: \{ zh: '决策驾驶舱'/g, "label: { zh: '驾驶舱'");
content = content.replace(/label: \{ zh: '危机监测'/g, "label: { zh: '危机概览'");
content = content.replace(/label: \{ zh: '价格'/g, "label: { zh: '德国航油价格'");
content = content.replace(/label: \{ zh: '专题分析'/g, "label: { zh: '案例分析'");

// Add saf-tipping-point
const safTippingPoint = `  {
    id: 'saf-tipping-point',
    path: { zh: '/crisis/saf-tipping-point', de: '/de/reports/tipping-point-analysis', en: '/en/reports/tipping-point-analysis' },
    label: { zh: 'SAF 临界点', de: 'SAF-Wendepunkt', en: 'SAF Tipping Point' }
  },
  {
    id: 'crisis',`;
content = content.replace(/  \{\n    id: 'crisis',/, safTippingPoint);

// Update navigationFor to only include the 7 items
const newNavigationFor = `export function navigationFor(locale: NavLocale): readonly NavItem[] {
  const allowedIds = ['home', 'dashboard', 'saf-tipping-point', 'crisis', 'prices', 'analysis', 'sources'];
  return NAV_ENTRIES.filter(entry => allowedIds.includes(entry.id)).flatMap((entry) => {
    const href = entry.path[locale];
    return href === null ? [] : [{ href, label: entry.label[locale] } as const];
  });
}`;

content = content.replace(/export function navigationFor[\s\S]*?\}\);\n\}/, newNavigationFor);

fs.writeFileSync(file, content);
console.log("Nav patched");
