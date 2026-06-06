import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { buildPageMetadata } from '@/lib/seo';
import { GridParityWorkbench } from '@/components/grid-parity-workbench';
import {
  type GridHistoryResponse,
  type GridLcoeSensitivityResponse,
  type GridParityResponse,
  gridStatusLabel,
  gridStatusTone,
  loadGridHistory,
  loadGridLcoeSensitivity,
  loadGridParity
} from '@/lib/grid-parity-read-model';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '电网平价分析',
  description:
    '交互式分析可再生电力（光伏/风电）相对化石发电在何种 EU ETS 碳价下跨越成本平价——与航空脱碳共用同一成本交叉引擎。',
  path: '/grid'
});

function GapSparkline({ history }: { history: GridHistoryResponse }) {
  const points = history.points;
  if (points.length < 2) return null;
  const width = 320;
  const height = 80;
  const gaps = points.map((p) => p.solar_gap_eur_per_mwh);
  const min = Math.min(...gaps, 0);
  const max = Math.max(...gaps, 0);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * height;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.solar_gap_eur_per_mwh).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" role="img" aria-label="光伏相对化石发电成本差趋势">
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#cbd5e1" strokeDasharray="4 3" />
      <path d={line} fill="none" stroke="#059669" strokeWidth={2} />
    </svg>
  );
}

function LcoeSensitivityMatrix({ sensitivity }: { sensitivity: GridLcoeSensitivityResponse }) {
  const cellByKey = new Map(
    sensitivity.cells.map((cell) => [`${cell.full_load_hours}:${cell.discount_rate}`, cell])
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-slate-950">LCOE 敏感性</h3>
        <p className="mt-1 text-sm text-slate-600">
          交叉点碳价 = 光伏击败燃气发电所需的最低 EU ETS 碳价。
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-2 pr-4">满负荷小时</th>
              {sensitivity.discount_rates.map((rate) => (
                <th key={rate} className="py-2 pr-4 text-right">
                  {(rate * 100).toFixed(0)}% WACC
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensitivity.full_load_hours.map((hours) => (
              <tr key={hours} className="border-b border-slate-200">
                <td className="py-2 pr-4 font-mono">{hours.toLocaleString('zh-CN')}</td>
                {sensitivity.discount_rates.map((rate) => {
                  const cell = cellByKey.get(`${hours}:${rate}`);
                  return (
                    <td key={`${hours}:${rate}`} className="py-2 pr-4 text-right font-mono">
                      {cell ? `€${cell.breakeven_carbon_price_eur_per_t.toFixed(0)}/t` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        默认技术：{sensitivity.tech_name}；格内数值为交叉点碳价（€/t）。
      </p>
      <p className="mt-2 text-xs text-slate-400">{sensitivity.disclaimer}</p>
    </article>
  );
}

export default async function GridParityPage() {
  let parity: GridParityResponse | null = null;
  let history: GridHistoryResponse | null = null;
  let lcoeSensitivity: GridLcoeSensitivityResponse | null = null;
  try {
    parity = await loadGridParity();
  } catch {
    parity = null;
  }
  try {
    history = await loadGridHistory();
  } catch {
    history = null;
  }
  try {
    lcoeSensitivity = await loadGridLcoeSensitivity();
  } catch {
    lcoeSensitivity = null;
  }

  return (
    <Shell
      eyebrow="能源转型情报"
      title="电网平价分析"
      description="可再生电力 vs 化石发电 + EU ETS 碳成本：同一碳价驱动天上（SAF）与地上（电网）两个脱碳前沿。"
    >
      {parity ? (
        <div className="space-y-6">
          <GridParityWorkbench initial={parity} />

          {history && (
            <article className="rounded-2xl border border-slate-200 bg-white/90 p-6">
              <h3 className="text-lg font-medium text-slate-950">历史成本交叉（{history.region}）</h3>
              <p className="mt-1 text-sm text-slate-600">
                光伏相对燃气发电（含碳成本）的成本差（€/MWh，负值＝光伏更便宜）。
              </p>
              <div className="mt-4">
                <GapSparkline history={history} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-300 text-left">
                      <th className="py-2 pr-4">年份</th>
                      <th className="py-2 pr-4 text-right">碳价</th>
                      <th className="py-2 pr-4 text-right">化石边际成本</th>
                      <th className="py-2 pr-4 text-right">光伏成本差</th>
                      <th className="py-2 pr-4">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.points.map((point) => (
                      <tr key={point.year} className="border-b border-slate-200">
                        <td className="py-2 pr-4">{point.year}</td>
                        <td className="py-2 pr-4 text-right font-mono">€{point.carbon_price_eur_per_t.toFixed(0)}/t</td>
                        <td className="py-2 pr-4 text-right font-mono">€{point.fossil_marginal_cost_eur_per_mwh.toFixed(1)}</td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {point.solar_gap_eur_per_mwh >= 0 ? '+' : ''}€{point.solar_gap_eur_per_mwh.toFixed(1)}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${gridStatusTone(point.status)}`}>
                            {gridStatusLabel(point.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-slate-400">{history.disclaimer}</p>
            </article>
          )}

          {lcoeSensitivity && <LcoeSensitivityMatrix sensitivity={lcoeSensitivity} />}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          电网平价数据当前不可用。请确认 API 已启动（本地：<code className="font-mono">npm run api:dev</code>）。
        </div>
      )}
    </Shell>
  );
}
