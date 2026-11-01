const fs = require('fs');

const file = 'apps/web/components/language-switcher.tsx';
let content = fs.readFileSync(file, 'utf-8');

// Add mapping to toGermanPath
content = content.replace(
  /export function toGermanPath\(pathname: string\): string \{/,
  "export function toGermanPath(pathname: string): string {\n  if (pathname === '/crisis/saf-tipping-point') {\n    return '/de/reports/tipping-point-analysis';\n  }"
);

// Add mapping to toEnglishPath
content = content.replace(
  /export function toEnglishPath\(pathname: string\): string \{/,
  "export function toEnglishPath(pathname: string): string {\n  if (pathname === '/crisis/saf-tipping-point') {\n    return '/en/reports/tipping-point-analysis';\n  }"
);

// Update mapping in toChinesePath for en
content = content.replace(
  /if \(pathname === '\/en\/reports\/tipping-point-analysis'\) \{\n    return '\/reports\/tipping-point-analysis';\n  \}/,
  "if (pathname === '/en/reports/tipping-point-analysis') {\n    return '/crisis/saf-tipping-point';\n  }"
);

// Update mapping in toChinesePath for de
content = content.replace(
  /if \(pathname === '\/de\/reports\/tipping-point-analysis'\) \{\n    return '\/reports\/tipping-point-analysis';\n  \}/,
  "if (pathname === '/de/reports/tipping-point-analysis') {\n    return '/crisis/saf-tipping-point';\n  }"
);

fs.writeFileSync(file, content);
console.log("Language switcher patched");
