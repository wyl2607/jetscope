import type { HeatSensitivityResponse } from '@/lib/heat-parity-read-model';

type Props = {
  initial: HeatSensitivityResponse;
};

const HEAT_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [ // figure-contract-lint-ignore: colour ramp stop, not a measurement
  { t: 0, rgb: [16, 185, 129] },
  { t: 0.5, rgb: [245, 158, 11] },
  { t: 1, rgb: [225, 29, 72] }
];

function lerp(a: number, b: number, f: number): number { // figure-contract-lint-ignore: colour interpolation helper, not a measurement
  return a + (b - a) * f;
}

// Lower breakeven carbon price (heat pump wins sooner) → greener; higher → red.
function heatColor(t: number): string { // figure-contract-lint-ignore: colour ramp position, not a measurement
  const x = Math.max(0, Math.min(1, t));
  const [lo, hi] = x <= 0.5 ? [HEAT_STOPS[0], HEAT_STOPS[1]] : [HEAT_STOPS[1], HEAT_STOPS[2]];
  const f = hi.t === lo.t ? 0 : (x - lo.t) / (hi.t - lo.t);
  const light = lo.rgb.map((c, i) => Math.round(lerp(lerp(c, hi.rgb[i], f), 255, 0.32)));
  return `rgb(${light[0]}, ${light[1]}, ${light[2]})`;
}

export function HeatSensitivityMatrix({ initial }: Props) {
  const cellByKey = new Map(
    initial.cells.map((cell) => [`${cell.elec_price_eur_per_mwh_el}:${cell.cop}`, cell])
  );
  const values = initial.cells.map((cell) => cell.breakeven_carbon_price_eur_per_t);
  const minBreakeven = values.length ? Math.min(...values) : 0;
  const maxBreakeven = values.length ? Math.max(...values) : 0;
  const span = maxBreakeven - minBreakeven;

  return (
    // Bare artifact: card, title and why-line come from the wrapping Panel.
    // The gas baseline stays here because it is a value, not a label.
    <div>
      <p className="mb-4 text-sm text-muted">
        交叉点碳价 = 热泵击败燃气锅炉所需的最低 EU ETS2 碳价（燃气基线 €
        {initial.gas_price_eur_per_mwh_th.toFixed(0)}/MWh）。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-muted">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4">居民电价</th>
              {initial.cops.map((cop) => (
                <th key={cop} className="py-2 pr-4 text-right">
                  COP {cop.toFixed(1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initial.elec_prices.map((elec) => (
              <tr key={elec} className="border-b border-line">
                <td className="py-2 pr-4 font-mono">€{elec.toFixed(0)}/MWh</td>
                {initial.cops.map((cop) => {
                  const cell = cellByKey.get(`${elec}:${cop}`);
                  if (!cell) {
                    return (
                      <td key={`${elec}:${cop}`} className="px-1 py-1 text-right font-mono text-subtle">
                        —
                      </td>
                    );
                  }
                  const t = span > 0 ? (cell.breakeven_carbon_price_eur_per_t - minBreakeven) / span : 0;
                  const label = `电价 €${elec.toFixed(0)}/MWh、COP ${cop.toFixed(1)}：交叉点碳价 €${cell.breakeven_carbon_price_eur_per_t.toFixed(0)}/t`;
                  return (
                    <td key={`${elec}:${cop}`} className="px-1 py-1">
                      <div
                        className="rounded-md px-2 py-1.5 text-right font-mono text-ink"
                        style={{ backgroundColor: heatColor(t) }}
                        title={label}
                        aria-label={label}
                      >
                        €{cell.breakeven_carbon_price_eur_per_t.toFixed(0)}/t
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
        <span>交叉点碳价</span>
        <span>低（热泵更早胜）</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{
            background:
              'linear-gradient(to right, rgb(92,207,169), rgb(248,189,89), rgb(235,101,131))'
          }}
          aria-hidden="true"
        />
        <span>高</span>
      </div>
      <p className="mt-2 text-xs text-subtle">{initial.disclaimer}</p>
    </div>
  );
}
