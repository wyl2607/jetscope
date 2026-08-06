#!/usr/bin/env node
/**
 * figure-contract-lint - enforces docs/UI_CONTRACT.md section 3.
 *
 * Section 1 is about colour and `design-system-lint.mjs` turns it into a build
 * failure. Section 3 is about whether a number on screen can say where it came
 * from, and until now nothing checked it - which is why the same defect kept
 * arriving from a different direction each batch: EU reserve days, the crisis
 * brief fallback, `defaultTippingPointResponse()`, `?? 0.657`.
 *
 * Two rules, both ratcheted the same way design-system-lint is:
 *
 *   bare-number-prop      a display component takes `foo: number` instead of
 *                         `foo: Figure`. The number arrives on screen with its
 *                         provenance already stripped, and no reviewer can see
 *                         what was lost.
 *
 *   self-stamped-fallback  `generated_at: new Date().toISOString()` inside a
 *                         fallback. This is the one that actually lies: it
 *                         stamps invented values with the current time, so a
 *                         page that renders the stamp reports made-up numbers
 *                         as freshly observed.
 *
 * Ratchet semantics (identical to design-system-lint):
 *   - a file not in the baseline must be clean
 *   - a baselined file may never exceed its recorded count
 *   - a file that improves must have its baseline lowered (--update), so the
 *     gain is locked in
 *
 * Escape hatch, for numbers that genuinely are not data:
 *
 *   columns: number; // figure-contract-lint-ignore: layout, not a measurement
 *
 * The reason is mandatory. An ignore without one does not count as an ignore.
 *
 * Usage:
 *   node scripts/figure-contract-lint.mjs            # check (CI mode)
 *   node scripts/figure-contract-lint.mjs --update   # rewrite the baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'scripts', 'figure-contract-baseline.json');

const COMPONENT_DIR = join('apps', 'web', 'components');
const PROVENANCE_DIRS = [
  join('apps', 'web', 'components'),
  join('apps', 'web', 'lib'),
  join('apps', 'web', 'app')
];

/**
 * `foo: number`, `foo?: number | null`, `foo: number[]`, `readonly foo: number`
 * - anywhere on the line, not just alone on it, because
 * `{ fossilJetUsdPerL: number; effectiveFossilJetUsdPerL: number }` on one line
 * is the same violation twice and used to be zero.
 */
const BARE_NUMBER_PROP =
  /(?:^|[{;,(])\s*(?:readonly\s+)?[A-Za-z_$][\w$]*\??\s*:\s*(?:readonly\s+)?number(?:\s*\[\])?(?:\s*\|\s*(?:null|undefined))*\s*(?=[;,})]|$)/g;

/** `generated_at: new Date().toISOString()` and every spelling of it. */
const SELF_STAMPED =
  /\b(?:as_?of|asOf|generated_?at|generatedAt|last_?updated|lastUpdated|timestamp)\b\s*[:=]\s*(?:new\s+Date\s*\(|Date\.now\s*\()/i;

const IGNORE = /figure-contract-lint-ignore:\s*\S+/;

const rules = [
  {
    id: 'bare-number-prop',
    hint: 'take a Figure from @/lib/figure - value, unit, asOf, sourceId, basis'
  },
  {
    id: 'self-stamped-fallback',
    hint: 'a fallback has no observation time; leave it null and mark the basis as assumption'
  }
];

const hintById = new Map(rules.map((rule) => [rule.id, rule.hint]));

async function collectFiles(dir, extensions) {
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
      out.push(...(await collectFiles(rel, extensions)));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * An ignore marker counts on the offending line or on the line directly above
 * it, so a long prop declaration can be annotated without wrapping.
 */
function ignored(lines, index) {
  return IGNORE.test(lines[index] ?? '') || IGNORE.test(lines[index - 1] ?? '');
}

function scanFile(rel, { props }) {
  const source = readFileSync(join(ROOT, rel), 'utf8');
  const lines = source.split('\n');
  const hits = [];

  lines.forEach((line, index) => {
    if (ignored(lines, index)) return;
    if (props) {
      BARE_NUMBER_PROP.lastIndex = 0;
      const found = line.match(BARE_NUMBER_PROP) ?? [];
      for (const _ of found) {
        hits.push({ rule: 'bare-number-prop', line: index + 1, text: line.trim() });
      }
    }
    if (SELF_STAMPED.test(line)) {
      hits.push({ rule: 'self-stamped-fallback', line: index + 1, text: line.trim() });
    }
  });

  return hits;
}

/** Absolute rules - no baseline, no exemption, ever. */
function hardRules(files) {
  const failures = [];
  const contractModule = join('apps', 'web', 'lib', 'figure.ts');

  for (const rel of files) {
    if (rel === contractModule) continue;
    const source = readFileSync(join(ROOT, rel), 'utf8');

    // A local `type Figure` shadows the contract one and every guarantee that
    // comes with it, while still type-checking and still reading correctly in
    // review. A locally redefined `Panel` cost two PRs to undo already.
    // Declaration only - `import { type Figure }` is the correct thing to do.
    if (/(?:^|\n)\s*(?:export\s+)?(?:type|interface)\s+Figure\b/.test(source)) {
      failures.push(
        `${toKey(rel)}: declares its own \`Figure\` type, shadowing the contract in ${toKey(contractModule)}. ` +
        'Import it instead. Contract section 3.'
      );
    }

    // `assumed()` refuses an asOf on purpose. Reaching around it defeats the
    // one rule the EU reserve-days incident was about.
    if (/basis:\s*'assumption'[\s\S]{0,200}?\basOf:\s*(?!null)['"`]/.test(source)) {
      failures.push(
        `${toKey(rel)}: an assumption carries an observation time. Contract section 3 rule 2.`
      );
    }
  }

  return failures;
}

const toKey = (rel) => rel.split(sep).join('/');

const update = process.argv.includes('--update');

const componentFiles = await collectFiles(COMPONENT_DIR, ['.tsx']);
const provenanceFiles = (
  await Promise.all(PROVENANCE_DIRS.map((dir) => collectFiles(dir, ['.ts', '.tsx'])))
).flat();

const scanned = new Map();
for (const rel of provenanceFiles) scanned.set(rel, { props: false });
for (const rel of componentFiles) scanned.set(rel, { props: true });

const counts = new Map();
const details = new Map();
for (const [rel, options] of [...scanned.entries()].sort()) {
  const hits = scanFile(rel, options);
  if (hits.length > 0) {
    counts.set(rel, hits.length);
    details.set(rel, hits);
  }
}

if (update) {
  const baseline = {
    $comment:
      'Files still violating docs/UI_CONTRACT.md section 3. Counts may only decrease. ' +
      'Regenerate with: node scripts/figure-contract-lint.mjs --update',
    files: Object.fromEntries([...counts.entries()].map(([rel, n]) => [toKey(rel), n]))
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(`figure-contract-lint: baseline updated - ${counts.size} files, ${total} violations.`);
  process.exit(0);
}

let baseline = { files: {} };
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(`figure-contract-lint: cannot read ${BASELINE_PATH}. Run with --update to create it.`);
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
      `${key}: ${count} figure-contract violations in a file that must stay clean.\n` +
        hits
          .map((hit) => `    line ${hit.line} [${hit.rule}]: ${hit.text}\n      -> ${hintById.get(hit.rule)}`)
          .join('\n')
    );
  } else if (count > allowed) {
    errors.push(
      `${key}: ${count} figure-contract violations, baseline allows ${allowed}. The ratchet only turns one way.`
    );
  } else if (count < allowed) {
    improved.push(`${key}: ${allowed} -> ${count}`);
  }
}

for (const key of Object.keys(baseline.files)) {
  if (![...counts.keys()].some((rel) => toKey(rel) === key)) {
    improved.push(`${key}: fully migrated, remove from baseline`);
  }
}

errors.push(...hardRules([...scanned.keys()]));

if (improved.length > 0) {
  errors.push(
    'baseline is stale - these files improved, lower the baseline so the gain is locked in ' +
      '(node scripts/figure-contract-lint.mjs --update):\n' +
      improved.map((line) => `    ${line}`).join('\n')
  );
}

const remaining = [...counts.values()].reduce((a, b) => a + b, 0);

if (errors.length > 0) {
  console.error('figure-contract-lint FAILED\n');
  for (const error of errors) console.error(`  - ${error}\n`);
  console.error(`See docs/UI_CONTRACT.md section 3. Remaining violations: ${remaining} across ${counts.size} files.`);
  process.exit(1);
}

console.log(
  `figure-contract-lint OK - ${scanned.size} files scanned, ` +
    `${remaining} legacy violations remaining in ${counts.size} baselined files.`
);
