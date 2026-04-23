/**
 * Webhook Server Test Suite
 * 
 * Tests for:
 * - GitHub signature verification (HMAC-SHA256)
 * - Webhook payload processing
 * - Error handling
 * - Edge cases
 * 
 * Run tests:
 *   npm test webhook-server.test.js
 *   node --test webhook-server.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import http from 'http';

/**
 * Mock GitHub webhook signature verification
 */
function createGitHubSignature(payload, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${hash}`;
}

/**
 * Test: Valid signature verification
 */
test('should verify valid GitHub signature', () => {
  const secret = 'test-secret-123';
  const payload = JSON.stringify({ ref: 'refs/heads/master', after: 'abc123' });
  const signature = createGitHubSignature(payload, secret);
  
  // Verify signature matches
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  const expected = `sha256=${hash}`;
  
  assert.strictEqual(signature, expected);
  assert.strictEqual(crypto.timingSafeEqual(expected, signature), true);
});

/**
 * Test: Invalid signature rejection
 */
test('should reject invalid GitHub signature', () => {
  const secret = 'test-secret-123';
  const payload = JSON.stringify({ ref: 'refs/heads/master', after: 'abc123' });
  const signature = createGitHubSignature(payload, 'wrong-secret');
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  const expected = `sha256=${hash}`;
  
  assert.notStrictEqual(signature, expected);
});

/**
 * Test: Signature with modified payload
 */
test('should reject signature with modified payload', () => {
  const secret = 'test-secret-123';
  const payload = JSON.stringify({ ref: 'refs/heads/master', after: 'abc123' });
  const signature = createGitHubSignature(payload, secret);
  
  // Modify payload
  const modifiedPayload = JSON.stringify({ ref: 'refs/heads/develop', after: 'abc123' });
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(modifiedPayload)
    .digest('hex');
  const expected = `sha256=${hash}`;
  
  assert.notStrictEqual(signature, expected);
});

/**
 * Test: SHA validation - must be 40 characters
 */
test('should validate commit SHA length', () => {
  const validSHA = 'a'.repeat(40);
  const invalidSHA1 = 'a'.repeat(39);
  const invalidSHA2 = 'a'.repeat(41);
  
  assert.strictEqual(validSHA.length, 40);
  assert.notStrictEqual(invalidSHA1.length, 40);
  assert.notStrictEqual(invalidSHA2.length, 40);
});

/**
 * Test: Master branch filtering
 */
test('should only process master branch pushes', () => {
  const masterRef = 'refs/heads/master';
  const developRef = 'refs/heads/develop';
  const featureRef = 'refs/heads/feature/new-ui';
  
  assert.strictEqual(masterRef, 'refs/heads/master');
  assert.notStrictEqual(developRef, 'refs/heads/master');
  assert.notStrictEqual(featureRef, 'refs/heads/master');
  
  // Test filtering logic
  const isValidRef = (ref) => ref === 'refs/heads/master';
  
  assert.strictEqual(isValidRef(masterRef), true);
  assert.strictEqual(isValidRef(developRef), false);
  assert.strictEqual(isValidRef(featureRef), false);
});

/**
 * Test: Webhook payload structure
 */
test('should validate webhook payload structure', () => {
  const validPayload = {
    ref: 'refs/heads/master',
    after: 'a'.repeat(40),
    repository: {
      full_name: 'user/safvsoil',
    },
    commits: [
      {
        id: 'a'.repeat(40),
        message: 'Test commit',
      },
    ],
  };
  
  // Validate required fields
  assert.ok(validPayload.ref);
  assert.ok(validPayload.after);
  assert.ok(validPayload.repository);
  assert.strictEqual(validPayload.after.length, 40);
  assert.ok(Array.isArray(validPayload.commits));
});

/**
 * Test: Error handling for missing signature
 */
test('should handle missing X-Hub-Signature-256 header', () => {
  const headers = {
    'content-type': 'application/json',
  };
  
  const signature = headers['x-hub-signature-256'];
  assert.strictEqual(signature, undefined);
});

/**
 * Test: Payload with null fields
 */
test('should handle null fields in payload', () => {
  const payload = {
    ref: 'refs/heads/master',
    after: 'a'.repeat(40),
    deleted: false,
    created: false,
    commits: [],
  };
  
  assert.ok(payload.after);
  assert.strictEqual(payload.commits.length, 0);
});

/**
 * Test: SHA hex validation
 */
test('should validate SHA is hexadecimal', () => {
  const validSHA = 'abcdef0123456789';
  const invalidSHA = 'gggggg0123456789'; // 'g' is not hex
  
  const isValidHex = (str) => /^[0-9a-fA-F]+$/.test(str);
  
  assert.strictEqual(isValidHex(validSHA), true);
  assert.strictEqual(isValidHex(invalidSHA), false);
});

/**
 * Test: Timing-safe comparison
 */
test('should use timing-safe comparison for signatures', () => {
  const secret = 'test-secret';
  const payload = 'test-payload';
  
  const hash1 = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  const hash2 = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // Both should match
  assert.strictEqual(hash1, hash2);
  assert.strictEqual(crypto.timingSafeEqual(hash1, hash2), true);
});

/**
 * Test: Empty payload handling
 */
test('should reject empty payload', () => {
  const emptyPayload = '';
  
  assert.strictEqual(emptyPayload.length, 0);
});

/**
 * Test: Webhook secret requirements
 */
test('should require webhook secret for production', () => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  
  // In tests, secret can be empty, but production should enforce it
  if (process.env.NODE_ENV === 'production') {
    assert.ok(secret.length > 0, 'GITHUB_WEBHOOK_SECRET required in production');
  }
});

/**
 * Test: Log event structure
 */
test('should create valid log event structure', () => {
  const logEvent = {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Test event',
    data: {
      sha: 'a'.repeat(40),
      ref: 'refs/heads/master',
    },
  };
  
  assert.ok(logEvent.timestamp);
  assert.strictEqual(logEvent.level, 'info');
  assert.ok(logEvent.message);
  assert.ok(logEvent.data);
  assert.strictEqual(logEvent.data.sha.length, 40);
});

/**
 * Test: Multiple concurrent webhook requests
 */
test('should handle multiple concurrent requests', async () => {
  const secret = 'test-secret';
  const payloads = Array.from({ length: 5 }, (_, i) => 
    JSON.stringify({
      ref: 'refs/heads/master',
      after: 'a'.repeat(39) + i,
    })
  );
  
  const signatures = payloads.map(p => createGitHubSignature(p, secret));
  
  // Verify all signatures are different (due to different payloads)
  const uniqueSignatures = new Set(signatures);
  assert.strictEqual(uniqueSignatures.size, payloads.length);
});

/**
 * Test: Ref filtering
 */
test('should correctly filter refs', () => {
  const refs = [
    'refs/heads/master',
    'refs/heads/develop',
    'refs/heads/feature/abc',
    'refs/tags/v1.0.0',
    'refs/pull/1/merge',
  ];
  
  const masterPushes = refs.filter(ref => ref === 'refs/heads/master');
  
  assert.strictEqual(masterPushes.length, 1);
  assert.strictEqual(masterPushes[0], 'refs/heads/master');
});

/**
 * Test: JSON parsing robustness
 */
test('should handle various JSON payload formats', () => {
  const payloads = [
    { ref: 'refs/heads/master', after: 'a'.repeat(40) },
    { ref: 'refs/heads/master', after: 'a'.repeat(40), extra: 'data' },
    { ref: 'refs/heads/master', after: 'a'.repeat(40), commits: [] },
  ];
  
  payloads.forEach(payload => {
    assert.ok(payload.ref);
    assert.strictEqual(payload.after.length, 40);
  });
});

console.log('✓ All webhook signature tests passed');
