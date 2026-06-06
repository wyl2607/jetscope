'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type GridLcoeSensitivityResponse,
  loadGridLcoeSensitivity
} from '@/lib/grid-parity-read-model';

type TechnologyKey = 'solar_pv' | 'onshore_wind' | 'offshore_wind';

type Props = {
  initial: GridLcoeSensitivityResponse;
};

const TECHNOLOGY_OPTIONS: Array<{ value: TechnologyKey; label: string }> = [
  { value: 'solar_pv', label: '光伏' },
  { value: 'onshore_wind', label: '陆上风电' },
  { value: 'offshore_wind', label: '海上风电' }
];

function isTechnologyKey(value: string): value is TechnologyKey {
  return TECHNOLOGY_OPTIONS.some((option) => option.value === value);
}

function formatCarbonPrice(value: number): string {
  return `€${value.toFixed(0)}/t`;
}

export function LcoeSensitivityMatrix({ initial }: Props) {
  const initialTechKey = isTechnologyKey(initial.tech_key) ? initial.tech_key : 'solar_pv';
  const [techKey, setTechKey] = useState<TechnologyKey>(initialTechKey);
  const [data, setData] = useState<GridLcoeSensitivityResponse>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const id = ++requestId.current;
    setPending(true);
    loadGridLcoeSensitivity({ techKey })
      .then((next) => {
        if (id === requestId.current) {
          setData(next);
          setError(null);
        }
      })
      .catch(() => {
        if (id === requestId.current) {
          setError('技术切换失败，展示上一次结果。');
        }
      })
      .finally(() => {
        if (id === requestId.current) setPending(false);
      });
  }, [techKey]);

  const cellByKey = useMemo(
    () => new Map(data.cells.map((cell) => [`${cell.full_load_hours}:${cell.discount_rate}`, cell])),
    [data.cells]
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-6" aria-busy={pending}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-slate-950">LCOE 敏感性</h3>
          <p className="mt-1 text-sm text-slate-600">
            交叉点碳价 = {data.tech_name} 击败燃气发电所需的最低 EU ETS 碳价。
          </p>
        </div>
        <label className="min-w-48 text-xs uppercase tracking-[0.14em] text-slate-600">
          发电技术
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            value={techKey}
            onChange={(event) => setTechKey(event.target.value as TechnologyKey)}
          >
            {TECHNOLOGY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pending && <p className="mb-3 text-xs text-emerald-700">正在更新敏感性矩阵...</p>}
      {error && <p className="mb-3 text-xs text-amber-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-2 pr-4">满负荷小时</th>
              {data.discount_rates.map((rate) => (
                <th key={rate} className="py-2 pr-4 text-right">
                  {(rate * 100).toFixed(0)}% WACC
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.full_load_hours.map((hours) => (
              <tr key={hours} className="border-b border-slate-200">
                <td className="py-2 pr-4 font-mono">{hours.toLocaleString('zh-CN')}</td>
                {data.discount_rates.map((rate) => {
                  const cell = cellByKey.get(`${hours}:${rate}`);
                  return (
                    <td key={`${hours}:${rate}`} className="py-2 pr-4 text-right font-mono">
                      {cell ? formatCarbonPrice(cell.breakeven_carbon_price_eur_per_t) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        当前技术：{data.tech_name}；格内数值为交叉点碳价（€/t）。
      </p>
      <p className="mt-2 text-xs text-slate-400">{data.disclaimer}</p>
    </article>
  );
}
