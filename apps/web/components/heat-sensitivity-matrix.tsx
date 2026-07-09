import type { HeatSensitivityResponse } from '@/lib/heat-parity-read-model';

type Props = {
  initial: HeatSensitivityResponse;
};

const HEAT_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0, rgb: [16, 185, 129] },
  { t: 0.5, rgb: [245, 158, 11] },
  { t: 1, rgb: [225, 29, 72] }
];

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

// Lower breakeven carbon price (heat pump wins sooner) → greener; higher → red.
function heatColor(t: number): string {
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
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-slate-950">供暖敏感性</h3>
        <p className="mt-1 text-sm text-slate-600">
          交叉点碳价 = 热泵击败燃气锅炉所需的最低 EU ETS2 碳价（燃气基线 €{initial.gas_price_eur_per_mwh_th.toFixed(0)}/MWh）。
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-300 text-left">
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
              <tr key={elec} className="border-b border-slate-200">
                <td className="py-2 pr-4 font-mono">€{elec.toFixed(0)}/MWh</td>
                {initial.cops.map((cop) => {
                  const cell = cellByKey.get(`${elec}:${cop}`);
                  if (!cell) {
                    return (
                      <td key={`${elec}:${cop}`} className="px-1 py-1 text-right font-mono text-slate-400">
                        —
                      </td>
                    );
                  }
                  const t = span > 0 ? (cell.breakeven_carbon_price_eur_per_t - minBreakeven) / span : 0;
                  const label = `电价 €${elec.toFixed(0)}/MWh、COP ${cop.toFixed(1)}：交叉点碳价 €${cell.breakeven_carbon_price_eur_per_t.toFixed(0)}/t`;
                  return (
                    <td key={`${elec}:${cop}`} className="px-1 py-1">
                      <div
                        className="rounded-md px-2 py-1.5 text-right font-mono text-slate-900"
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
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
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
      <p className="mt-2 text-xs text-slate-400">{initial.disclaimer}</p>
    </article>
  );
}
