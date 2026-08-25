import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProxyFailure, PUBLIC_PROXY_ERROR } from '../apps/web/app/api/_shared/proxy-errors.ts';

test('non-timeout proxy failures use a stable redacted 502 contract', () => {
  const internalMessage = 'fetch failed for https://internal-api.example.test:8000/private';
  const result = classifyProxyFailure(new Error(internalMessage), 'req-non-timeout');

  assert.equal(result.status, 502);
  assert.deepEqual(result.publicBody, {
    error: PUBLIC_PROXY_ERROR,
    request_id: 'req-non-timeout'
  });
  assert.equal(result.internalMessage, internalMessage);
  assert.doesNotMatch(JSON.stringify(result.publicBody), /internal-api|8000|fetch failed/);
});

test('timeout proxy failures preserve 504 without exposing the exception', () => {
  const timeout = new Error('request aborted after 8000ms');
  timeout.name = 'AbortError';
  const result = classifyProxyFailure(timeout, 'req-timeout');

  assert.equal(result.status, 504);
  assert.deepEqual(result.publicBody, {
    error: PUBLIC_PROXY_ERROR,
    request_id: 'req-timeout'
  });
  assert.doesNotMatch(JSON.stringify(result.publicBody), /aborted|8000/);
});
