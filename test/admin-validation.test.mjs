import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validatePathwaysPayload,
  validatePoliciesPayload,
  validateScenarioPayload
} from '../apps/web/lib/admin-validation.ts';

const ADMIN_UI_FILES = [
  new URL('../apps/web/app/admin/page.tsx', import.meta.url),
  new URL('../apps/web/components/admin-data-ops.tsx', import.meta.url),
  new URL('../apps/web/components/cards.tsx', import.meta.url)
];

test('validateScenarioPayload accepts API-compatible preferences/route_edits', () => {
  const result = validateScenarioPayload(
    JSON.stringify({
      schema_version: 1,
      crudeSource: 'manual',
      carbonSource: 'manual',
      benchmarkMode: 'crude-proxy',
      carbonPriceUsdPerTonne: 120
    }),
    JSON.stringify({
      'sugar-atj': {
        baseCostUsdPerLiter: 1.88,
        co2SavingsKgPerLiter: 1.72
      }
    })
  );

  assert.equal(result.preferences.schema_version, 1);
  assert.equal(typeof result.route_edits['sugar-atj'], 'object');
});

test('validateScenarioPayload rejects unsupported enum values and NaN-like fields', () => {
  assert.throws(
    () =>
      validateScenarioPayload(
        JSON.stringify({
          crudeSource: 'unknown-source',
          benchmarkMode: 'crude-proxy'
        }),
        '{}'
      ),
    /unsupported value/i
  );

  assert.throws(
    () =>
      validateScenarioPayload(
        JSON.stringify({
          crudeSource: 'manual',
          benchmarkMode: 'crude-proxy'
        }),
        JSON.stringify({
          'ptl-esaf': { baseCostUsdPerLiter: 'NaN' }
        })
      ),
    /finite number/i
  );
});

test('validatePathwaysPayload enforces required fields and finite numeric values', () => {
  const result = validatePathwaysPayload(
    JSON.stringify([
      {
        pathway_id: 'sugar-atj',
        name: 'Sugar ATJ-SPK',
        pathway: 'Sugar -> Ethanol -> Jet',
        base_cost_usd_per_l: 1.6,
        co2_savings_kg_per_l: 1.5,
        category: 'saf'
      }
    ])
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'saf');

  assert.throws(
    () =>
      validatePathwaysPayload(
        JSON.stringify([
          {
            pathway_id: 'x',
            name: '',
            pathway: 'x',
            base_cost_usd_per_l: 1.2,
            co2_savings_kg_per_l: 1.1,
            category: 'saf'
          }
        ])
      ),
    /non-empty string/i
  );
});

test('validatePathwaysPayload accepts summary-style rows and backfills optional fields', () => {
  const result = validatePathwaysPayload(
    JSON.stringify([
      {
        pathway_id: 'summary-only',
        name: 'Summary Pathway',
        base_cost_usd_per_l: 2.2,
        co2_savings_kg_per_l: 1.3
      }
    ])
  );
  assert.equal(result[0].pathway, 'Summary Pathway');
  assert.equal(result[0].category, 'saf');
});

test('validatePoliciesPayload enforces year integer + finite shares + non-empty label', () => {
  const result = validatePoliciesPayload(
    JSON.stringify([
      {
        year: 2030,
        saf_share_pct: 6,
        synthetic_share_pct: 1.2,
        label: 'Early scale-up'
      }
    ])
  );
  assert.equal(result.length, 1);

  assert.throws(
    () =>
      validatePoliciesPayload(
        JSON.stringify([
          {
            year: 2030.5,
            saf_share_pct: 6,
            synthetic_share_pct: 1.2,
            label: 'Bad year'
          }
        ])
      ),
    /year must be an integer/i
  );
});

test('admin UI keeps a light operations theme', async () => {
  for (const file of ADMIN_UI_FILES) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /bg-slate-950(?!\/)|bg-slate-950\/|bg-slate-900\/70|from-slate-900|to-black|text-white/,
      `${file.pathname} should not hard-code dark admin surfaces`
    );
  }
});

test('admin market refresh shows database persistence evidence', async () => {
  const adminSource = await readFile(new URL('../apps/web/components/admin-data-ops.tsx', import.meta.url), 'utf8');
  const marketSchema = await readFile(new URL('../apps/api/app/schemas/market.py', import.meta.url), 'utf8');
  const marketRoute = await readFile(new URL('../apps/api/app/api/routes/market.py', import.meta.url), 'utf8');

  assert.match(adminSource, /refreshEvidence/);
  assert.match(adminSource, /Promise<unknown>/);
  assert.match(adminSource, /return await response\.json\(\)/);
  assert.match(adminSource, /setPoliciesJson\(stringify\(policiesPayload\)\)/);
  assert.match(adminSource, /\/api\/market\/refresh/);
  assert.match(adminSource, /\/api\/market/);
  assert.match(adminSource, /persisted_metric_count/);
  assert.match(adminSource, /market_snapshots/);
  assert.match(adminSource, /本地数据库/);
  assert.match(adminSource, /friendlyAdminError/);
  assert.match(marketSchema, /persisted_metric_count/);
  assert.match(marketSchema, /source_status/);
  assert.match(marketSchema, /refreshed_at/);
  assert.match(marketRoute, /MarketSnapshot/);
  assert.match(marketRoute, /func\.count/);
});
