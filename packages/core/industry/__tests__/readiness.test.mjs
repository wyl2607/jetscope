import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { computeIndustrySignal, computePathwayReadiness } from '../readiness.ts';

test('computeIndustrySignal returns viable when gap <= 0', () => {
  const signal = computeIndustrySignal(0.6, 0.7);
  assert.equal(signal.status, 'viable');
});

test('computeIndustrySignal returns threshold when gap is 0.20', () => {
  const signal = computeIndustrySignal(1.0, 0.8);
  assert.equal(signal.status, 'threshold');
});

test('computeIndustrySignal returns watching when gap is 0.50', () => {
  const signal = computeIndustrySignal(1.3, 0.8);
  assert.equal(signal.status, 'watching');
});

test('computeIndustrySignal returns far when gap is 1.00', () => {
  const signal = computeIndustrySignal(1.8, 0.8);
  assert.equal(signal.status, 'far');
});

test('computeIndustrySignal preserves threshold boundary behavior', () => {
  assert.equal(computeIndustrySignal(1.1, 0.8).status, 'watching');
  assert.equal(computeIndustrySignal(1.5, 0.8).status, 'far');

  const threshold = computeIndustrySignal(1.0, 0.8);
  assert.equal(threshold.gapUsdPerLiter, 0.19999999999999996);
  assert.equal(threshold.labelKey, 'industry.signal.threshold');
});

test('computePathwayReadiness clamps to 100 at parity and 0 above base cost', () => {
  assert.equal(computePathwayReadiness(0.9, 1.8, 1.0), 100);
  assert.equal(computePathwayReadiness(2.0, 1.8, 1.0), 0);
});

test('computeIndustrySignal quality gate uses ordered signal thresholds', () => {
  const source = readFileSync(new URL('../readiness.ts', import.meta.url), 'utf8');
  const functionSource = source.match(/export function computeIndustrySignal[\s\S]*?\n}/)?.[0] ?? '';

  assert.match(source, /SIGNAL_THRESHOLDS/);
  assert.match(source, /maxGapUsdPerLiter/);
  assert.match(functionSource, /computeIndustrySignal/);
  assert.doesNotMatch(functionSource, /else\s+if/);
});
