import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A test file that nothing runs is worse than no test file: it reads as
// coverage in review and reports nothing in CI. This repo has been bitten
// twice — 21 test/*.test.mjs files were tracked but absent from the `test`
// script, and apps/web/vitest.config.ts once carried a bad react alias that
// silently zeroed 24 component tests. Both were invisible because nothing
// asserted that the suite actually runs what the repo contains.
//
// This guard closes that: every tracked *.test.mjs must be reachable from the
// `test` script, and every path the script names must actually match something.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function trackedTestFiles() {
  try {
    return execFileSync('git', ['ls-files', '*.test.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // Not a git checkout (release tarball, vendored copy). Fall back to a walk
    // so the guard still runs; it over-reports untracked files, which is safe.
    const found = [];
    const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv']);
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) walk(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.test.mjs')) {
          found.push(path.relative(repoRoot, path.join(dir, entry.name)).split(path.sep).join('/'));
        }
      }
    };
    walk(repoRoot);
    return found;
  }
}

function referencedPatterns() {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const script = pkg.scripts?.test;
  assert.ok(script, 'package.json has no "test" script');
  return script
    .split(/\s+/)
    .filter((token) => token.endsWith('.test.mjs'))
    .map((token) => token.replace(/^\.\//, ''));
}

function patternToRegExp(pattern) {
  // `*` matches within one path segment, `**` crosses segments.
  const body = pattern
    .split(/(\*\*|\*)/)
    .map((part) => {
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`);
}

test('every tracked test file is referenced by the npm test script', () => {
  const tracked = trackedTestFiles();
  const matchers = referencedPatterns().map(patternToRegExp);

  assert.ok(tracked.length > 0, 'found no tracked *.test.mjs files — the discovery step is broken');

  const orphans = tracked.filter((file) => !matchers.some((matcher) => matcher.test(file)));

  assert.deepEqual(
    orphans,
    [],
    `${orphans.length} tracked test file(s) are not run by "npm test". Add them to the ` +
      `"test" script in package.json, or delete them if they describe a retired part ` +
      `of the product:\n  ${orphans.join('\n  ')}`
  );
});

test('every path named by the npm test script matches a real test file', () => {
  const tracked = new Set(trackedTestFiles());
  const patterns = referencedPatterns();
  const dead = patterns.filter((pattern) => {
    const matcher = patternToRegExp(pattern);
    return ![...tracked].some((file) => matcher.test(file));
  });

  assert.deepEqual(
    dead,
    [],
    `The "test" script names ${dead.length} path(s) that match no test file. A glob that ` +
      `matches nothing runs zero tests and still exits 0:\n  ${dead.join('\n  ')}`
  );
});
