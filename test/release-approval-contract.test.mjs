import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const releaseScript = readFileSync(join(process.cwd(), 'scripts/release.sh'), 'utf8');
const publishScript = readFileSync(join(process.cwd(), 'scripts/publish-to-github.sh'), 'utf8');

test('release side effects require matching approval token', () => {
  assert.match(releaseScript, /--approval-token\)\n\s+APPROVAL_TOKEN=/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_RELEASE:-/);
  assert.match(releaseScript, /publish, sync, or deploy requires --approval-token/);
  assert.match(releaseScript, /APPROVE_JETSCOPE_PUBLISH="\$APPROVAL_TOKEN" \.\/scripts\/publish-to-github\.sh --approval-token "\$APPROVAL_TOKEN"/);
});

test('publish side effects require matching publish approval token', () => {
  assert.match(publishScript, /--approval-token\)\n\s+APPROVAL_TOKEN=/);
  assert.match(publishScript, /APPROVE_JETSCOPE_PUBLISH:-/);
  assert.match(publishScript, /publish requires --approval-token and matching APPROVE_JETSCOPE_PUBLISH/);
});
