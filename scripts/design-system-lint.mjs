#!/usr/bin/env node
/**
 * design-system-lint - enforces docs/UI_CONTRACT.md section 1 and section 4.
 *
 * The contract says color may only be expressed through design tokens. This
 * script is what turns that sentence into a build failure.
 *
 * It works as a ratchet, not a big bang. `design-system-baseline.json` lists the
 * files that already violate the contract, with the violation count each one is
 * currently allowed. A file may only get better:
 *
 *   - a file not in the baseline must be clean
 *   - a file in the baseline may not exceed its recorded count
 *   - a file that drops below its recorded count must have the baseline lowered
 *     (run with --update to do that), so the ratchet never slips back
 *
 * Usage:
 *   node scripts/design-system-lint.mjs            # check (CI mode)
 *   node scripts/design-system-lint.mjs --update   # rewrite the baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'scripts', 'design-system-baseline.json');
// lib/ is scanned too: read models hand class names to components, so a raw
// palette class hidden in a read model bypasses a components-only scan.
const SCAN_DIRS = [
  join('apps', 'web', 'app'),
  join('apps', 'web', 'components'),
  join('apps', 'web', 'lib')
];
const GLOBALS_CSS = join('apps', 'web', 'app', 'globals.css');
const NAV_MODULE = join('apps', 'web', 'lib', 'navigation.ts');

const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose'
].join('|');

const PREFIX = [
  'bg', 'text', 'border', 'ring', 'from', 'via', 'to', 'decoration', 'divide',
  'fill', 'stroke', 'placeholder', 'outline', 'shadow', 'accent', 'caret'
].join('|');

/** `bg-slate-900`, `text-sky-300/60`, `hover:border-rose-500` ... */
const RAW_PALETTE = new RegExp(`\\b(?:${PREFIX})-(?:${PALETTE})-\\d{2,3}(?:\\/\\d{1,3})?\\b`, 'g');
/** `text-white`, `bg-black/40` - absolutes are tokens' job too. */
const RAW_ABSOLUTE = new RegExp(`\\b(?:${PREFIX})-(?:white|black)(?:\\/\\d{1,3})?\\b`, 'g');

const rules = [
  { id: 'raw-palette-class', pattern: RAW_PALETTE, hint: 'use a token utility (bg-surface, text-muted, text-danger, border-line)' },
  { id: 'raw-absolute-class', pattern: RAW_ABSOLUTE, hint: 'use bg-surface / text-ink instead of white / black' }
];

async function collectFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...(await collectFiles(rel)));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}

function scanFile(rel) {
  const source = readFileSync(join(ROOT, rel), 'utf8');
  const hits = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      hits.push({ rule: rule.id, line, text: match[0], hint: rule.hint });
    }
  }
  return hits;
}

/** Contract rules that are absolute - no baseline, no exemption, ever. */
function hardRules() {
  const failures = [];

  const css = readFileSync(join(ROOT, GLOBALS_CSS), 'utf8');
  const deprecatedAt = css.indexOf('DEPRECATED COMPATIBILITY LAYER');
  const bangCount = (css.match(/!important/g) ?? []).length;
  const bangAfter = deprecatedAt === -1
    ? 0
    : (css.slice(deprecatedAt).match(/!important/g) ?? []).length;
  const bangBefore = bangCount - bangAfter;
  if (bangBefore > ALLOWED_IMPORTANT_OUTSIDE_LEGACY) {
    failures.push(
      `${GLOBALS_CSS}: ${bangBefore} "!important" outside the deprecated layer ` +
      `(allowed: ${ALLOWED_IMPORTANT_OUTSIDE_LEGACY}). Contract section 1 rule 4.`
    );
  }

  const themeBlock = css.match(/@theme\s*\{[\s\S]*?\n\}/);
  if (!themeBlock) {
    failures.push(`${GLOBALS_CSS}: missing @theme token block. Contract section 1 rule 1.`);
  }

  for (const rel of SHELL_FILES) {
    let source;
    try {
      source = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    if (/navByLocale\s*=\s*\{/.test(source) && rel !== NAV_MODULE) {
      failures.push(
        `${rel}: navigation defined outside ${NAV_MODULE}. Contract section 4 rule 1.`
      );
    }
  }

  return failures;
}

const ALLOWED_IMPORTANT_OUTSIDE_LEGACY = 6; // pre-existing; must trend to 0 in P1
const SHELL_FILES = [join('apps', 'web', 'components', 'shell.tsx')];

const update = process.argv.includes('--update');

const files = (await Promise.all(SCAN_DIRS.map(collectFiles))).flat().sort();
const counts = new Map();
const details = new Map();
for (const rel of files) {
  const hits = scanFile(rel);
  if (hits.length > 0) {
    counts.set(rel, hits.length);
    details.set(rel, hits);
  }
}

const toKey = (rel) => rel.split(sep).join('/');

if (update) {
  const baseline = {
    $comment: 'Files still violating docs/UI_CONTRACT.md section 1. Counts may only decrease. Regenerate with: node scripts/design-system-lint.mjs --update',
    files: Object.fromEntries([...counts.entries()].map(([rel, n]) => [toKey(rel), n]))
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(`design-system-lint: baseline updated - ${counts.size} files, ${total} violations.`);
  process.exit(0);
}

let baseline = { files: {} };
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(`design-system-lint: cannot read ${BASELINE_PATH}. Run with --update to create it.`);
  process.exit(1);
}

const errors = [];
const improved = [];

for (const [rel, count] of counts) {
  const key = toKey(rel);
  const allowed = baseline.files[key];
  if (allowed === undefined) {
    const hits = details.get(rel).slice(0, 5);
    errors.push(
      `${key}: ${count} raw color utilities in a file that must stay token-only.\n` +
      hits.map((h) => `    line ${h.line}: ${h.text}  ->  ${h.hint}`).join('\n')
    );
  } else if (count > allowed) {
    errors.push(`${key}: ${count} raw color utilities, baseline allows ${allowed}. The ratchet only turns one way.`);
  } else if (count < allowed) {
    improved.push(`${key}: ${allowed} -> ${count}`);
  }
}

for (const key of Object.keys(baseline.files)) {
  if (![...counts.keys()].some((rel) => toKey(rel) === key)) {
    improved.push(`${key}: fully migrated, remove from baseline`);
  }
}

errors.push(...hardRules());

if (improved.length > 0) {
  errors.push(
    'baseline is stale - these files improved, lower the baseline so the gain is locked in ' +
    '(node scripts/design-system-lint.mjs --update):\n' +
    improved.map((line) => `    ${line}`).join('\n')
  );
}

const remaining = [...counts.entries()].reduce((a, [, n]) => a + n, 0);

if (errors.length > 0) {
  console.error('design-system-lint FAILED\n');
  for (const error of errors) console.error(`  - ${error}\n`);
  console.error(`See docs/UI_CONTRACT.md. Remaining legacy violations: ${remaining} across ${counts.size} files.`);
  process.exit(1);
}

console.log(
  `design-system-lint OK - ${files.length} files scanned, ` +
  `${remaining} legacy violations remaining in ${counts.size} baselined files.`
);
