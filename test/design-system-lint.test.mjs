import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LINT = join(ROOT, 'scripts', 'design-system-lint.mjs');
const FIXTURE = join(ROOT, 'apps', 'web', 'components', '__design-system-contract-fixture__.tsx');

function runLint() {
  return spawnSync(process.execPath, [LINT], { cwd: ROOT, encoding: 'utf8' });
}

function expectsRed(name, contents, expectedMessage) {
  test(`design-system-lint rejects ${name}`, () => {
    try {
      writeFileSync(FIXTURE, contents, 'utf8');
      const red = runLint();
      assert.equal(red.status, 1, `lint should fail for ${name}\n${red.stdout}${red.stderr}`);
      assert.match(red.stderr, expectedMessage);
    } finally {
      rmSync(FIXTURE, { force: true });
    }
    // Other lint tests write their own fixtures concurrently, so assert only that
    // this fixture no longer contributes a violation.
    const after = runLint();
    assert.doesNotMatch(`${after.stdout}${after.stderr}`, /__design-system-contract-fixture__/, 'lint should stop reporting this fixture once it is gone');
  });
}

test('design-system-lint passes on the current tree', () => {
  const result = runLint();
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

expectsRed(
  'a literal SVG hex color in fill',
  `export function Fixture() {\n  return <circle fill="#cbd5e1" />;\n}\n`,
  /use a CSS variable or currentColor/
);

expectsRed(
  'a literal SVG hex color in stroke',
  `export function Fixture() {\n  return <circle stroke="#cbd5e1" />;\n}\n`,
  /use a CSS variable or currentColor/
);

expectsRed(
  'a literal SVG rgb color in fill',
  `export function Fixture() {\n  return <circle fill="rgb(255, 0, 0)" />;\n}\n`,
  /use a CSS variable or currentColor/
);

expectsRed(
  'a literal SVG named color in fill',
  `export function Fixture() {\n  return <circle fill="red" />;\n}\n`,
  /use a CSS variable or currentColor/
);
