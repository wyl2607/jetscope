import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `scripts/deploy-usa-vps.sh` sat on main unable to parse at all:
//
//     DEPLOY_COMMIT="$(git -C "$ROOT" rev-parse --verify HEAD^{commit}")"
//                                                                  ^
// one quote on the wrong side of `HEAD^{commit}`, which opens a string that
// swallows the rest of the `if`. `bash -n` rejects the whole file. Nothing
// caught it because nothing ever parsed these scripts: CI runs Node tests and
// Python tests, and the deploy script only runs on a human's machine, on the
// day they are trying to deploy.
//
// This is the same shape as test-script-coverage.test.mjs — infrastructure that
// is broken in a way no product test can see. A parse check is cheap, has no
// false positives, and would have failed the moment that quote landed.
//
// It checks syntax only. It does not run anything.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function trackedShellScripts() {
  try {
    return execFileSync('git', ['ls-files', '*.sh'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // Not a git checkout (release tarball, vendored copy). Walk instead; this
    // over-reports untracked scripts, which is the safe direction.
    const found = [];
    const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', 'data']);
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) walk(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.sh')) {
          found.push(path.relative(repoRoot, path.join(dir, entry.name)).split(path.sep).join('/'));
        }
      }
    };
    walk(repoRoot);
    return found;
  }
}

const scripts = trackedShellScripts();

test('the repository actually contains shell scripts to check', () => {
  // Guard the guard: if the discovery above ever returns nothing, every
  // assertion below passes vacuously and this file becomes decoration.
  assert.ok(scripts.length > 0, 'found no tracked *.sh files - the discovery step is broken');
});

test('every tracked shell script parses', () => {
  const broken = [];

  for (const rel of scripts) {
    const result = spawnSync('bash', ['-n', rel], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    if (result.error) {
      // No bash on this machine. Skip rather than fail: a Windows contributor
      // without Git Bash should not see a red suite, and CI runs on Linux.
      return;
    }

    if (result.status !== 0) {
      broken.push(`${rel}\n    ${(result.stderr || '').trim().split('\n').join('\n    ')}`);
    }
  }

  assert.deepEqual(
    broken,
    [],
    `shell scripts that do not parse:\n  ${broken.join('\n  ')}\n\n` +
      'Run `bash -n <file>` to reproduce. A script that does not parse cannot run,\n' +
      'and a deploy script that cannot run is discovered at the worst moment.'
  );
});
