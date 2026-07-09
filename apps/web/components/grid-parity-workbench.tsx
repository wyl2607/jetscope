'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type GridParityResponse,
  gridSignalLabel,
  gridStatusLabel,
  gridStatusTone,
  loadGridParity
} from '@/lib/grid-parity-read-model';

type Props = {
  initial: GridParityResponse;
};

export function GridParityWorkbench({ initial }: Props) {
  const [carbonPrice, setCarbonPrice] = useState<number>(
    Math.round(initial.inputs.carbon_price_eur_per_t)
  );
  const [data, setData] = useState<GridParityResponse>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (carbonPrice === Math.round(initial.inputs.carbon_price_eur_per_t) && data === initial) {
      return;
    }
    const id = ++requestId.current;
    setPending(true);
    const handle = setTimeout(() => {
      loadGridParity({ carbonPriceEurPerT: carbonPrice })
        .then((next) => {
          if (id === requestId.current) {
            setData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (id === requestId.current) {
            setError('实时重算失败，展示上一次结果。');
          }
        })
        .finally(() => {
          if (id === requestId.current) setPending(false);
        });
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carbonPrice]);

  const fossil = data.fossil_reference;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-slate-950">电网平价模拟器</h3>
          <p className="mt-1 text-sm text-slate-600">
            拖动碳价，实时观察可再生电力相对化石发电（含 EU ETS 碳成本）的成本交叉点。
          </p>
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${gridStatusTone(
            data.rows[0]?.status ?? 'inflection'
          )}`}
        >
          {gridSignalLabel(data.signal)}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-slate-700">
          <label htmlFor="carbon-price" className="font-medium uppercase tracking-wider">
            EU ETS 碳价
          </label>
          <span className="font-mono text-base font-semibold text-slate-950">
            €{carbonPrice}/t {pending && <span className="text-xs text-slate-400">…</span>}
          </span>
        </div>
        <input
          id="carbon-price"
          type="range"
          min={0}
          max={150}
          step={1}
          value={carbonPrice}
          onChange={(event) => setCarbonPrice(Number(event.target.value))}
          className="mt-2 w-full accent-emerald-600"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>€0</span>
          <span>€150/t</span>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
        化石参照（{fossil.name}）边际成本：
        <span className="ml-1 font-mono font-semibold text-slate-950">
          €{fossil.marginal_cost_eur_per_mwh.toFixed(1)}/MWh
        </span>
        <span className="ml-1 text-xs text-slate-500">
          （燃料 €{fossil.fuel_cost_eur_per_mwh_th.toFixed(0)}/MWhₜₕ ÷ 效率 {fossil.efficiency} + 碳 €
          {(carbonPrice * fossil.emission_intensity_t_per_mwh).toFixed(1)}/MWh）
        </span>
      </div>

      {error && <p className="mb-3 text-xs text-amber-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-2 pr-4">可再生技术</th>
              <th className="py-2 pr-4 text-right">LCOE</th>
              <th className="py-2 pr-4 text-right">vs 化石</th>
              <th className="py-2 pr-4 text-right">价差</th>
              <th className="py-2 pr-4">状态</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.tech_key} className="border-b border-slate-200">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  €{row.lcoe_mid_eur_per_mwh.toFixed(0)}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {row.gap_vs_fossil_eur_per_mwh >= 0 ? '+' : ''}
                  €{row.gap_vs_fossil_eur_per_mwh.toFixed(1)}
                </td>
                <td className="py-2 pr-4 text-right font-mono">{row.spread_pct.toFixed(1)}%</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${gridStatusTone(
                      row.status
                    )}`}
                  >
                    {gridStatusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
