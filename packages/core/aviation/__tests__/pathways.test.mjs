import assert from 'node:assert/strict';
import test from 'node:test';

import { getCanonicalPathway, listCanonicalPathways } from '../pathways.ts';

test('listCanonicalPathways returns non-empty canonical pathway records', () => {
  const pathways = listCanonicalPathways();

  assert.ok(Array.isArray(pathways));
  assert.ok(pathways.length > 0);

  for (const pathway of pathways) {
    assert.equal(typeof pathway.pathwayKey, 'string');
    assert.equal(typeof pathway.displayName, 'string');
    assert.equal(typeof pathway.feedstockFamily, 'string');
    assert.equal(typeof pathway.maturityLevel, 'string');
    assert.equal(typeof pathway.costLowUsdPerL, 'number');
    assert.equal(typeof pathway.costHighUsdPerL, 'number');
    assert.equal(typeof pathway.carbonReductionLowPct, 'number');
    assert.equal(typeof pathway.carbonReductionHighPct, 'number');
    assert.equal(typeof pathway.sourceBasis, 'string');
  }
});

test('listCanonicalPathways returns unique pathway keys', () => {
  const pathways = listCanonicalPathways();
  const keys = pathways.map((pathway) => pathway.pathwayKey);

  assert.equal(new Set(keys).size, keys.length);
});

test('getCanonicalPathway returns the matching pathway for a valid key', () => {
  const pathway = getCanonicalPathway('hefa');

  assert.equal(pathway.pathwayKey, 'hefa');
  assert.equal(pathway, listCanonicalPathways().find((candidate) => candidate.pathwayKey === 'hefa'));
});

test('getCanonicalPathway returns undefined for an invalid key', () => {
  assert.equal(getCanonicalPathway('invalid-pathway'), undefined);
});
