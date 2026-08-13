import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * A ratchet for the P1.5 page conversion, in the same spirit as
 * scripts/design-system-baseline.json: once a page is converted it may not slip
 * back, and the properties the template exists to guarantee are asserted rather
 * than assumed.
 *
 * Add a page here as it is converted. Do not remove entries.
 */
const CONVERTED_PAGES = [
  'apps/web/app/heat/page.tsx',
  'apps/web/app/reports/page.tsx',
  'apps/web/app/de/reports/page.tsx',
  'apps/web/app/en/reports/page.tsx',
  'apps/web/app/crisis/page.tsx',
  'apps/web/app/de/crisis/page.tsx',
  'apps/web/app/en/crisis/page.tsx',
  'apps/web/app/dashboard/page.tsx',
  'apps/web/app/de/dashboard/page.tsx',
  'apps/web/app/en/dashboard/page.tsx',
  'apps/web/app/sources/page.tsx',
  'apps/web/app/de/sources/page.tsx',
  'apps/web/app/en/sources/page.tsx',
  'apps/web/app/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/de/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/en/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/research/page.tsx',
  'apps/web/app/de/research/page.tsx',
  'apps/web/app/en/research/page.tsx',
  'apps/web/app/scenarios/page.tsx',
  'apps/web/app/de/scenarios/page.tsx',
  'apps/web/app/en/scenarios/page.tsx',
  'apps/web/app/faq/page.tsx',
  'apps/web/app/de/faq/page.tsx',
  'apps/web/app/en/faq/page.tsx',
  'apps/web/app/admin/page.tsx',
  'apps/web/app/de/admin/page.tsx',
  'apps/web/app/en/admin/page.tsx',
  'apps/web/app/page.tsx',
  'apps/web/app/de/page.tsx',
  'apps/web/app/en/page.tsx',
  'apps/web/app/crisis/eu-jet-reserves/page.tsx',
  'apps/web/app/crisis/saf-tipping-point/page.tsx',
  'apps/web/app/grid/page.tsx',
  'apps/web/app/analysis/page.tsx',
  'apps/web/app/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/de/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/en/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx',
  'apps/web/app/analysis/lufthansa-2026-de/page.tsx',
  'apps/web/app/de/lufthansa-saf-2026/page.tsx',
  'apps/web/app/en/lufthansa-saf-2026/page.tsx'
];

const STATIC_LUFTHANSA_ANALYSIS_PAGES = [
  'apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx',
  'apps/web/app/analysis/lufthansa-2026-de/page.tsx',
  'apps/web/app/de/lufthansa-saf-2026/page.tsx',
  'apps/web/app/en/lufthansa-saf-2026/page.tsx'
];

/** Pages that render a read model with an isFallback flag. */
const FALLBACK_AWARE_PAGES = [
  'apps/web/app/reports/page.tsx',
  'apps/web/app/de/reports/page.tsx',
  'apps/web/app/en/reports/page.tsx',
  'apps/web/app/dashboard/page.tsx',
  'apps/web/app/de/dashboard/page.tsx',
  'apps/web/app/en/dashboard/page.tsx',
  'apps/web/app/sources/page.tsx',
  'apps/web/app/de/sources/page.tsx',
  'apps/web/app/en/sources/page.tsx',
  'apps/web/app/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/de/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/en/prices/germany-jet-fuel/page.tsx',
  'apps/web/app/de/scenarios/page.tsx',
  'apps/web/app/en/scenarios/page.tsx',
  'apps/web/app/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/de/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/en/reports/tipping-point-analysis/page.tsx'
];

const HOME_PAGES = [
  'apps/web/app/page.tsx',
  'apps/web/app/de/page.tsx',
  'apps/web/app/en/page.tsx'
];

const TIPPING_POINT_REPORT_PAGES = [
  'apps/web/app/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/de/reports/tipping-point-analysis/page.tsx',
  'apps/web/app/en/reports/tipping-point-analysis/page.tsx'
];

/**
 * Pages on the crisis-brief contract. It reports a fallback through `error`
 * rather than an `isFallback` flag, so the guard reads differently - but the
 * property being held is identical: never stamp invented values as fresh.
 */
const CRISIS_BRIEF_PAGES = ['apps/web/app/de/crisis/page.tsx', 'apps/web/app/en/crisis/page.tsx'];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

/**
 * Thin locale wrappers render `<FaqPage locale="…" />` or
 * `<CrisisPage locale="…" />`. The template contract lives in that shared
 * view, not in the three route files.
 */
async function implementationOf(path) {
  const source = await read(path);
  if (/\/faq\/page\.tsx$/.test(path) && source.includes('<FaqPage')) {
    return read('apps/web/components/faq-page.tsx');
  }
  if (/\/crisis\/page\.tsx$/.test(path) && source.includes('<CrisisPage')) {
    return read('apps/web/components/crisis-page.tsx');
  }
  return source;
}

test('converted pages use the template rather than Shell directly', async () => {
  for (const path of CONVERTED_PAGES) {
    const source = await implementationOf(path);
    assert.match(source, /<PageTemplate/, `${path} must render PageTemplate`);
    assert.doesNotMatch(source, /<Shell\b/, `${path} must not reach past the template to Shell`);
  }
});

test('every converted page states the decision question it answers', async () => {
  for (const path of CONVERTED_PAGES) {
    const source = await implementationOf(path);

    const dictionaryKey = /\/faq\/page\.tsx$/.test(path)
      ? 'faq'
      : /\/crisis\/page\.tsx$/.test(path)
        ? 'crisis'
        : null;

    if (dictionaryKey) {
      assert.match(
        source,
        /question=\{copy\.question\}/,
        `${path} must pass a question to PageTemplate`
      );
      for (const locale of ['zh', 'de', 'en']) {
        const dictionary = JSON.parse(await read(`apps/web/src/locales/${locale}.json`));
        const question = dictionary[dictionaryKey]?.question;
        assert.ok(
          typeof question === 'string' && question.trim().length > 10,
          `${locale}.json ${dictionaryKey}.question must be a real sentence, got: ${question}`
        );
      }
      continue;
    }

    const match = source.match(/question="([^"]+)"/);
    assert.ok(match, `${path} must pass a question to PageTemplate`);
    assert.ok(
      match[1].trim().length > 10,
      `${path} question must be a real sentence, got: ${match[1]}`
    );
  }
});

test('every converted page ends with its sources', async () => {
  for (const path of CONVERTED_PAGES) {
    const source = await implementationOf(path);
    assert.match(source, /<SourceFooter/, `${path} must close with SourceFooter (contract section 2 rule 4)`);
    assert.match(source, /limitations=\{/, `${path} must state its limitations, not imply completeness`);
  }
});

test('static FAQ pages never invent a data timestamp', async () => {
  for (const path of [
    'apps/web/app/faq/page.tsx',
    'apps/web/app/de/faq/page.tsx',
    'apps/web/app/en/faq/page.tsx'
  ]) {
    const source = await implementationOf(path);
    assert.match(source, /asOf=\{null\}/, `${path} must explicitly state that it has no data timestamp`);
    assert.doesNotMatch(source, /new Date\(/, `${path} must not turn render or build time into an as-of stamp`);
  }
});

test('static Lufthansa analysis pages never invent a data timestamp', async () => {
  for (const path of STATIC_LUFTHANSA_ANALYSIS_PAGES) {
    const source = await read(path);
    assert.match(source, /asOf=\{null\}/, `${path} must explicitly state that it has no page-level data timestamp`);
    assert.doesNotMatch(source, /new Date\(/, `${path} must not turn publication or render time into an as-of stamp`);
  }
});

test('the static analysis index never invents a data timestamp', async () => {
  const path = 'apps/web/app/analysis/page.tsx';
  const source = await read(path);
  assert.match(source, /asOf=\{null\}/, `${path} must explicitly state that it has no data timestamp`);
  assert.doesNotMatch(source, /new Date\(/, `${path} must not turn render or build time into an as-of stamp`);
});

function assertCrisisFallbackBasis(source, path) {
  const expected = path.includes('eu-jet-reserves')
    ? [
        /basis: reserveIsAssumed \? 'assumption'/,
        /basis: readModel\.isFallback \|\| brentIsAssumed \? 'assumption'/,
        /basis: readModel\.isFallback \|\| jetEuIsAssumed \? 'assumption'/,
        /basis: readModel\.isFallback \|\| carbonIsAssumed \? 'assumption'/
      ]
    : [
        /basis: readModel\.isFallback \|\| fuelSource === 'assumed' \? 'assumption'/,
        /basis: readModel\.isFallback \|\| carbonIsAssumed \? 'assumption'/,
        /basis: reserveIsAssumed \? 'assumption'/
      ];

  for (const pattern of expected) {
    assert.match(source, pattern, `${path} must label every built-in crisis input as an assumption`);
  }
}

test('crisis subpages never label built-in numeric fallbacks as observed', async () => {
  for (const path of [
    'apps/web/app/crisis/eu-jet-reserves/page.tsx',
    'apps/web/app/crisis/saf-tipping-point/page.tsx'
  ]) {
    const source = await read(path);
    assertCrisisFallbackBasis(source, path);

    // Mutation check: prove the guard catches the historical failure mode in
    // which an inline fallback keeps its value but is relabelled as observed.
    const regressed = source.replace(/\? 'assumption'/g, "? 'observed'");
    assert.throws(
      () => assertCrisisFallbackBasis(regressed, `${path} (mutated)`),
      /must label every built-in crisis input as an assumption/
    );
  }
});

test('a page on fallback data never stamps it with a fresh timestamp', async () => {
  // The fallback read model sets generated_at to the current time. Rendering
  // that as a data timestamp would present fabricated values as freshly
  // observed, which is the failure this contract exists to prevent.
  for (const path of FALLBACK_AWARE_PAGES) {
    const source = await read(path);
    // Matched loosely on purpose: the guarantee is "the stamp is gated on
    // isFallback", not one particular spelling of it. Pinning the exact line
    // would make a prettier run look like a contract violation.
    assert.match(
      source,
      /(?:dashboardReadModel|readModel)\.isFallback\s*\?\s*null\s*:\s*(?:(?:dashboardReadModel|readModel)\.market\.generated_at|readModel\.generatedAt|observedAsOf)/,
      `${path} must suppress the timestamp while on fallback data`
    );
    assert.match(
      source,
      /basis:\s*(?:dashboardReadModel|readModel)\.isFallback\s*\?\s*'assumption'\s*:/,
      `${path} must label fallback data as an assumption, never as observed`
    );
  }
});

test('a crisis-brief page on fallback data never stamps it with a fresh timestamp', async () => {
  for (const path of CRISIS_BRIEF_PAGES) {
    const source = await implementationOf(path);
    assert.match(
      source,
      /readModel\.error\s*\?\s*null\s*:/,
      `${path} must suppress the timestamp while the crisis brief is on fallback`
    );
    assert.match(
      source,
      /basis:\s*readModel\.error\s*\?\s*'assumption'\s*:\s*'observed'/,
      `${path} must label fallback data as an assumption, never as observed`
    );
  }
});

test('scenario pages never stamp default analysis timestamps as fresh data', async () => {
  const primarySource = await read('apps/web/app/scenarios/page.tsx');
  assert.match(
    primarySource,
    /const\s+asOf\s*=\s*usingDefaultTippingPoint\s*\?\s*null\s*:\s*tippingPoint\.generated_at/,
    'apps/web/app/scenarios/page.tsx must suppress the default tipping-point timestamp'
  );
  assert.match(
    primarySource,
    /asOf:\s*usingDefaultDecision\s*\?\s*null\s*:\s*airlineDecision\.generated_at/,
    'apps/web/app/scenarios/page.tsx must suppress the default decision timestamp'
  );
  assert.match(
    primarySource,
    /basis:\s*usingDefaultTippingPoint\s*\?\s*'assumption'\s*:\s*'derived'/,
    'apps/web/app/scenarios/page.tsx must label default tipping-point values as assumptions'
  );
  assert.match(
    primarySource,
    /basis:\s*usingDefaultDecision\s*\?\s*'assumption'\s*:\s*'derived'/,
    'apps/web/app/scenarios/page.tsx must label default decision values as assumptions'
  );
});

test('a reserve reading is labelled by how it was produced, not assumed observed', async () => {
  // A hand estimate presented with the same weight as an official filing is
  // the failure this contract exists to prevent, so every crisis page has to
  // route source_type through a basis mapping rather than hardcoding observed.
  for (const path of ['apps/web/app/crisis/page.tsx', ...CRISIS_BRIEF_PAGES]) {
    const source = await implementationOf(path);
    assert.match(source, /function reserveBasis\(/, `${path} must map reserve source_type to a basis`);
    assert.match(source, /return 'assumption'/, `${path} must fall back to assumption, not to observed`);
  }
});

test('home-page event tone fallbacks remain semantic problem states', async () => {
  function assertSemanticFallback(source, path) {
    const mapping = source.match(/function eventTone\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
    assert.ok(mapping, `${path} must keep eventTone as an explicit status mapping`);
    const returns = [...mapping[1].matchAll(/return\s+'([^']+)'/g)].map((match) => match[1]);
    const fallback = returns.at(-1);
    assert.ok(fallback, `${path} eventTone must have a fallback branch`);
    assert.doesNotMatch(
      fallback,
      /text-(?:muted|ink|subtle)/,
      `${path} must not wash an unknown event type into a neutral tone`
    );
  }

  for (const path of HOME_PAGES) {
    const source = await read(path);
    assertSemanticFallback(source, path);

    // Mutation check: prove this guard fails for the historical regression,
    // rather than merely matching the current implementation by accident.
    const regressed = source.replace(/(function eventTone\([^)]*\)[^{]*\{[\s\S]*?)return 'text-warning';\n\}/, "$1return 'text-muted';\n}");
    assert.throws(
      () => assertSemanticFallback(regressed, `${path} (mutated)`),
      /must not wash an unknown event type/
    );
  }
});

test('tipping-point reports never label an assumed fossil anchor as observed', async () => {
  for (const path of TIPPING_POINT_REPORT_PAGES) {
    const source = await read(path);
    assert.match(source, /const fossilJetSource\s*=/, `${path} must retain the fossil-price fallback level`);
    assert.match(
      source,
      /fossilJetSource === 'spot' \? 'observed' : fossilJetSource === 'assumed' \? 'assumption' : 'derived'/,
      `${path} must label the built-in or missing fossil anchor as an assumption`
    );
    if (source.includes('0.657')) {
      assert.match(source, /fossilJetSource === 'assumed'/, `${path} must expose the 0.657 fallback branch`);
      assert.match(source, /内置假设 0\.657 USD\/L/, `${path} must disclose the 0.657 assumption on the page`);
    }
  }
});

test('home pages derive as-of from source timestamps, never the current clock', async () => {
  for (const path of HOME_PAGES) {
    const source = await read(path);
    const assignment = source.match(/const asOf\s*=\s*([^;]+);/);
    assert.ok(assignment, `${path} must derive a page-level asOf`);
    assert.doesNotMatch(assignment[1], /new Date\s*\(/, `${path} must not stamp the home page with the current clock`);
    assert.match(assignment[1], /latestTimestamp/, `${path} must select the freshest real source timestamp`);
  }
});
