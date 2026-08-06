import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  assumed,
  derived,
  figureViolations,
  formatFigure,
  freshestAsOf,
  isStale,
  missing,
  observed,
  weakestBasis
} from '../apps/web/lib/figure.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LINT = join(ROOT, 'scripts', 'figure-contract-lint.mjs');
const FIXTURE = join(ROOT, 'apps', 'web', 'components', '__figure-contract-fixture__.tsx');

function runLint() {
  return spawnSync(process.execPath, [LINT], { cwd: ROOT, encoding: 'utf8' });
}

/**
 * A ratchet nobody has watched fail is a ratchet nobody knows is connected.
 * Each case writes a file that violates the contract and asserts the lint goes
 * red, then removes it and asserts the tree is green again.
 */
function expectsRed(name, contents, expectedMessage) {
  test(`figure-contract-lint rejects ${name}`, () => {
    try {
      writeFileSync(FIXTURE, contents, 'utf8');
      const red = runLint();
      assert.equal(red.status, 1, `lint should fail for ${name}\n${red.stdout}${red.stderr}`);
      assert.match(red.stderr, expectedMessage);
    } finally {
      rmSync(FIXTURE, { force: true });
    }
    assert.equal(runLint().status, 0, 'lint should be green again once the fixture is gone');
  });
}

test('figure-contract-lint passes on the current tree', () => {
  const result = runLint();
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

expectsRed(
  'a display component that takes a bare number',
  `export function Fixture({ price }: { price: number }) {\n  return <p>{price}</p>;\n}\n`,
  /bare-number-prop/
);

expectsRed(
  'a fallback that stamps itself with the current time',
  `export const fixture = {\n  generated_at: new Date().toISOString()\n};\n`,
  /self-stamped-fallback/
);

expectsRed(
  'a locally redeclared Figure type',
  `type Figure = { value: number };\nexport const fixture: Figure = { value: 1 };\n`,
  /shadowing the contract/
);

expectsRed(
  'an assumption carrying an observation time',
  `export const fixture = {\n  basis: 'assumption',\n  asOf: '2026-08-06T00:00:00Z'\n};\n`,
  /assumption carries an observation time/
);

test('figure-contract-lint honours an ignore marker with a stated reason', () => {
  try {
    writeFileSync(
      FIXTURE,
      'export function Fixture({ columns }: {\n' +
        '  // figure-contract-lint-ignore: grid layout, not a measurement\n' +
        '  columns: number;\n' +
        '}) {\n  return <p>{columns}</p>;\n}\n',
      'utf8'
    );
    assert.equal(runLint().status, 0, 'an annotated non-data number is allowed');
  } finally {
    rmSync(FIXTURE, { force: true });
  }
});

test('an ignore marker without a reason does not count', () => {
  try {
    writeFileSync(
      FIXTURE,
      'export function Fixture({ columns }: {\n' +
        '  columns: number; // figure-contract-lint-ignore:\n' +
        '}) {\n  return <p>{columns}</p>;\n}\n',
      'utf8'
    );
    assert.equal(runLint().status, 1, 'a bare ignore marker must not silence the rule');
  } finally {
    rmSync(FIXTURE, { force: true });
  }
});

test('constructors refuse to let an assumption look like a measurement', () => {
  const guess = assumed({ value: 0.657, unit: 'USD/L', sourceId: 'jet-price', method: 'built-in default' });
  assert.equal(guess.asOf, null);
  assert.equal(guess.basis, 'assumption');
  assert.deepEqual(figureViolations(guess), []);
});

test('a derived figure without a method is a violation', () => {
  const bad = { value: 1, unit: '%', asOf: null, sourceId: 's', basis: 'derived' };
  assert.match(figureViolations(bad).join(' '), /requires a method/);
});

test('a null value without a reason is a violation', () => {
  const bad = { value: null, unit: '%', asOf: null, sourceId: 's', basis: 'observed' };
  assert.match(figureViolations(bad).join(' '), /must state its reason/);
});

test('an assumption with an observation time is a violation', () => {
  const bad = {
    value: 1,
    unit: '%',
    asOf: '2026-08-06T00:00:00Z',
    sourceId: 's',
    basis: 'assumption',
    method: 'default'
  };
  assert.match(figureViolations(bad).join(' '), /asOf must be null/);
});

test('the page stamp comes from the freshest observation, never from an assumption', () => {
  const stamp = freshestAsOf([
    observed({ value: 1, unit: 'USD/L', asOf: '2026-08-01T00:00:00Z', sourceId: 'a' }),
    observed({ value: 2, unit: 'USD/L', asOf: '2026-08-05T00:00:00Z', sourceId: 'b' }),
    assumed({ value: 3, unit: 'USD/L', sourceId: 'c', method: 'default' })
  ]);
  assert.equal(stamp, '2026-08-05T00:00:00Z');

  assert.equal(
    freshestAsOf([assumed({ value: 3, unit: 'USD/L', sourceId: 'c', method: 'default' })]),
    null,
    'a page built entirely on assumptions has no data timestamp at all'
  );
});

test('a page is only as observed as its weakest load-bearing number', () => {
  const spot = observed({ value: 1, unit: 'USD/L', asOf: '2026-08-05T00:00:00Z', sourceId: 'a' });
  const model = derived({ value: 2, unit: 'USD/L', asOf: '2026-08-05T00:00:00Z', sourceId: 'b', method: 'm' });
  const guess = assumed({ value: 3, unit: 'USD/L', sourceId: 'c', method: 'default' });

  assert.equal(weakestBasis([spot]), 'observed');
  assert.equal(weakestBasis([spot, model]), 'derived');
  assert.equal(weakestBasis([spot, model, guess]), 'assumption');
});

test('staleness is measured against the cadence the source promised', () => {
  const now = new Date('2026-08-06T00:00:00Z');
  const fresh = observed({ value: 1, unit: 'USD/L', asOf: '2026-08-05T20:00:00Z', sourceId: 'a', maxAgeHours: 24 });
  const old = observed({ value: 1, unit: 'USD/L', asOf: '2026-08-01T00:00:00Z', sourceId: 'a', maxAgeHours: 24 });
  const noCadence = observed({ value: 1, unit: 'USD/L', asOf: '2020-01-01T00:00:00Z', sourceId: 'a' });

  assert.equal(isStale(fresh, now), false);
  assert.equal(isStale(old, now), true);
  assert.equal(isStale(noCadence, now), false);
});

test('a missing figure formats as an em dash, never as zero', () => {
  const gap = missing({ unit: 'weeks', sourceId: 'reserves', reason: '上游接口暂时不可用' });
  assert.equal(formatFigure(gap), '—');
  assert.equal(gap.value, null);
  assert.deepEqual(figureViolations(gap), []);
});
