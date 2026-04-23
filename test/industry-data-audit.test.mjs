import test from 'node:test';
import assert from 'node:assert/strict';

import { INDUSTRY_AIRLINES } from '../packages/core/industry/airlines.ts';
import { INDUSTRY_COUNTRIES } from '../packages/core/industry/countries.ts';

test('industry baselines explicitly mark verified vs estimate entries', () => {
  const countries = INDUSTRY_COUNTRIES.map((item) => item.verificationStatus);
  const airlines = INDUSTRY_AIRLINES.map((item) => item.verificationStatus);

  assert.ok(countries.includes('verified'));
  assert.ok(countries.includes('estimate'));
  assert.ok(airlines.every((item) => item === 'estimate'));
});

test('estimated industry baselines include explicit review wording in source notes', () => {
  for (const item of [...INDUSTRY_COUNTRIES, ...INDUSTRY_AIRLINES]) {
    if (item.verificationStatus === 'estimate') {
      assert.match(item.sourceNote, /estimate, needs verification/i);
    }
  }
});
