'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type HeatParityResponse,
  type HeatParityStatus,
  heatSignalLabel,
  heatStatusLabel,
  heatStatusTone,
  loadHeatParity
} from '@/lib/heat-parity-read-model';

type Props = {
  initial: HeatParityResponse;
};

function sweepTone(status: HeatParityStatus): string {
  if (status === 'dominant') return 'bg-emerald-500';
  if (status === 'marginal_switch') return 'bg-sky-500';
  if (status === 'inflection') return 'bg-amber-500';
  return 'bg-rose-400';
}

export function HeatParityWorkbench({ initial }: Props) {
  const [carbonPrice, setCarbonPrice] = useState<number>(
    Math.round(initial.inputs.carbon_price_eur_per_t)
  );
  const [data, setData] = useState<HeatParityResponse>(initial);
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
      loadHeatParity({ carbonPriceEurPerT: carbonPrice })
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

  const gas = data.gas_boiler_reference;
  const signalStatus: HeatParityStatus =
    data.signal === 'clear_leader'
      ? 'dominant'
      : data.signal === 'close_race'
        ? 'inflection'
        : 'uneconomic';
  const sweepByTech = data.rows.map((row) => ({
    row,
    points: data.carbon_sweep
      .map((point) => ({
        carbon: point.carbon_price_eur_per_t,
        entry: point.techs.find((entry) => entry.tech_key === row.tech_key)
      }))
      .filter((point) => point.entry)
  }));

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-slate-950">供暖平价模拟器</h3>
          <p className="mt-1 text-sm text-slate-600">
            拖动 ETS2 碳价，观察热泵相对燃气冷凝锅炉的有用热成本交叉点。
          </p>
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${heatStatusTone(signalStatus)}`}
        >
          {heatSignalLabel(data.signal)}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-slate-700">
          <label htmlFor="heat-carbon-price" className="font-medium uppercase tracking-wider">
            EU ETS2 碳价
          </label>
          <span className="font-mono text-base font-semibold text-slate-950">
            €{carbonPrice}/t {pending && <span className="text-xs text-slate-400">...</span>}
          </span>
        </div>
        <input
          id="heat-carbon-price"
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
        燃气参照（{gas.name}）有用热成本：
        <span className="ml-1 font-mono font-semibold text-slate-950">
          €{gas.heat_cost_eur_per_mwh.toFixed(1)}/MWh
        </span>
        <span className="ml-1 text-xs text-slate-500">
          （燃气 €{gas.gas_price_eur_per_mwh_th.toFixed(0)}/MWhₜₕ ÷ 效率 {gas.efficiency} + ETS2 碳 €
          {(
            carbonPrice *
            gas.emission_intensity_t_per_mwh_th /
            gas.efficiency
          ).toFixed(1)}
          /MWh）
        </span>
      </div>

      {error && <p className="mb-3 text-xs text-amber-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-2 pr-4">热泵技术</th>
              <th className="py-2 pr-4 text-right">COP</th>
              <th className="py-2 pr-4 text-right">热泵成本</th>
              <th className="py-2 pr-4 text-right">vs 燃气</th>
              <th className="py-2 pr-4 text-right">交叉碳价</th>
              <th className="py-2 pr-4">状态</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.tech_key} className="border-b border-slate-200">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4 text-right font-mono">{row.cop.toFixed(1)}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  €{row.hp_heat_cost_eur_per_mwh.toFixed(1)}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {row.gap_vs_gas_eur_per_mwh >= 0 ? '+' : ''}
                  €{row.gap_vs_gas_eur_per_mwh.toFixed(1)}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  €{row.breakeven_carbon_price_eur_per_t.toFixed(0)}/t
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${heatStatusTone(
                      row.status
                    )}`}
                  >
                    {heatStatusLabel(row.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className="text-sm font-semibold text-slate-950">碳价扫描</h4>
        <p className="mt-1 text-xs text-slate-500">
          每格为 €15/t：红色＝暂不经济，琥珀＝拐点，蓝色＝临界切换，绿色＝热泵占优。
        </p>
        <div className="mt-4 space-y-3">
          {sweepByTech.map(({ row, points }) => (
            <div key={row.tech_key} className="grid gap-2 md:grid-cols-[9rem_1fr] md:items-center">
              <div className="text-sm text-slate-700">{row.name}</div>
              <div className="grid grid-cols-11 gap-1">
                {points.map((point) => (
                  <span
                    key={`${row.tech_key}-${point.carbon}`}
                    className={`h-3 rounded-sm ${sweepTone(point.entry!.status)}`}
                    title={`€${point.carbon}/t: ${heatStatusLabel(point.entry!.status)}`}
                    aria-label={`${row.name} €${point.carbon}/t ${heatStatusLabel(point.entry!.status)}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
