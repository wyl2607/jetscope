import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importWebLib } from './helpers/load-web-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = JSON.parse(readFileSync(path.join(repoRoot, 'test', 'aviation-cost-shared.json'), 'utf8'));

function pythonBin() {
  const candidates = [
    process.env.JETSCOPE_PYTHON_BIN,
    process.env.PYTHON_BIN,
    path.join(repoRoot, 'apps', 'api', '.venv', 'Scripts', 'python.exe'),
    path.join(repoRoot, 'apps', 'api', '.venv', 'bin', 'python')
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function snakeToCamel(raw) {
  return {
    fossilJetUsdPerL: raw.fossil_jet_usd_per_l,
    usdPerEur: raw.usd_per_eur,
    fuelBurnT: raw.fuel_burn_t,
    passengers: raw.passengers,
    safUsdPerL: raw.saf_usd_per_l,
    blendShare: raw.blend_share,
    etsApplicable: raw.ets_applicable,
    quality: raw.quality
  };
}

function backendDelta(caseName) {
  const script = `
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(${JSON.stringify(path.join(repoRoot, 'apps', 'api'))}).resolve()))
from app.services.aviation_cost import compute_cost_change
payload = json.loads(Path(${JSON.stringify(path.join(repoRoot, 'test', 'aviation-cost-shared.json'))}).read_text(encoding="utf-8"))
case = payload[${JSON.stringify(caseName)}]
print(json.dumps(compute_cost_change(baseline=case["baseline"], current=case["current"])))
`;
  const output = execFileSync(pythonBin(), ['-c', script], {
    encoding: 'utf8',
    cwd: path.join(repoRoot, 'apps', 'api')
  });
  return JSON.parse(output);
}

function driverSum(drivers) {
  return Object.values(drivers).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
}

test('frontend and backend cost-change stay conservative on shared SAF+FX inputs', async () => {
  const { computeCostChange } = await importWebLib('apps/web/lib/aviation-cost.ts');
  const caseName = 'saf_and_fx';
  const { baseline, current } = shared[caseName];
  const frontend = computeCostChange(snakeToCamel(baseline), snakeToCamel(current));
  const backend = backendDelta(caseName);

  assert.equal(frontend.driversEurPerFlight.saf != null, true);
  assert.equal(backend.drivers_eur_per_flight.saf != null, true);
  assert.notEqual(frontend.driversEurPerFlight.fx, 0);
  assert.notEqual(backend.drivers_eur_per_flight.fx, 0);

  const frontSum = driverSum(frontend.driversEurPerFlight);
  const backSum = driverSum(backend.drivers_eur_per_flight);
  assert.ok(Math.abs(frontSum - frontend.fuelAndComplianceDeltaEur) <= 0.02);
  assert.ok(Math.abs(backSum - backend.fuel_and_compliance_delta_eur) <= 0.02);
  assert.ok(Math.abs(frontend.fuelAndComplianceDeltaEur - backend.fuel_and_compliance_delta_eur) <= 0.02);
  assert.ok(Math.abs(frontend.driversEurPerFlight.jet_price - backend.drivers_eur_per_flight.jet_price) <= 0.02);
  assert.ok(Math.abs(frontend.driversEurPerFlight.fx - backend.drivers_eur_per_flight.fx) <= 0.02);
  assert.ok(Math.abs(frontend.driversEurPerFlight.saf - backend.drivers_eur_per_flight.saf) <= 0.02);
});
