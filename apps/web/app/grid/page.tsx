import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { buildPageMetadata } from '@/lib/seo';
import { GridParityWorkbench } from '@/components/grid-parity-workbench';
import { GridHistoryChart } from '@/components/grid-history-chart';
import { LcoeSensitivityMatrix } from '@/components/lcoe-sensitivity-matrix';
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
                逐年化石边际成本、光伏 LCOE 与 EU ETS 碳价：碳价上行推高化石成本，光伏跨过平价线。
              </p>
              <div className="mt-4">
                <GridHistoryChart points={history.points} />
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

          {lcoeSensitivity && <LcoeSensitivityMatrix initial={lcoeSensitivity} />}

          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Methodology</p>
            <h3 className="mt-2 text-lg font-medium text-slate-950">方法论</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              LCOE 自底向上算法用 CRF 将 CAPEX、固定运维和满负荷小时折算到 €/MWh；交叉点碳价表示化石边际成本被 EU ETS 碳成本推高到与可再生 LCOE 相交时的价格。
            </p>
            <a
              href="https://github.com/wyl2607/jetscope/blob/main/docs/GRID_LCOE_METHODOLOGY.md"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-100"
            >
              打开 docs/GRID_LCOE_METHODOLOGY.md
            </a>
          </article>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          电网平价数据当前不可用。请确认 API 已启动（本地：<code className="font-mono">npm run api:dev</code>）。
        </div>
      )}
    </Shell>
  );
}
