import type { Metadata } from 'next';
import { MetricCard } from '@/components/cards';
import { GridHistoryChart } from '@/components/grid-history-chart';
import { GridParityWorkbench } from '@/components/grid-parity-workbench';
import { LcoeSensitivityMatrix } from '@/components/lcoe-sensitivity-matrix';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { buildPageMetadata } from '@/lib/seo';
import {
  type GridHistoryResponse,
  type GridLcoeSensitivityResponse,
  type GridParityResponse,
  gridSignalLabel,
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

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.filter(
    (value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
  );
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
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

  const leadingRow = parity?.rows[0] ?? null;
  const historyHasFallback = history?.points.some((point) => point.fallback) ?? false;
  const asOf = latestTimestamp([
    parity?.generated_at,
    history?.generated_at,
    lcoeSensitivity?.generated_at
  ]);

  return (
    <PageTemplate
      eyebrow="能源转型情报"
      title="电网平价分析"
      question="在你设定的碳价下，可再生发电已经比化石发电加碳成本便宜了吗？"
      asOf={asOf}
    >
      <SignalRow label="电网平价结论">
        <MetricCard
          label="当前情景结论"
          value={parity ? gridSignalLabel(parity.signal) : '数据不可用'}
          valueClassName={parity ? gridStatusTone(leadingRow?.status ?? 'inflection').replace(/border-\S+|bg-\S+/g, '') : 'text-danger'}
          hint="结论随下方碳价滑块变化，是情景结果而不是市场现值。"
        />
        <MetricCard
          label="领先技术"
          value={leadingRow?.name ?? '需重新连接'}
          hint={leadingRow ? `状态：${gridStatusLabel(leadingRow.status)}` : '电网平价 API 当前不可用。'}
        />
        <MetricCard
          label="历史证据"
          value={history ? `${history.points.length} 个年度点` : '未加载'}
          valueClassName={historyHasFallback ? 'text-warning' : 'text-ink'}
          hint={historyHasFallback ? '历史序列含回退值，引用前需要复核。' : '用于核对成本交叉是否已经在历史序列中出现。'}
        />
      </SignalRow>

      <Panel
        title="电网平价模拟器"
        why="拖动碳价，观察可再生电力相对化石发电（含 EU ETS 碳成本）的成本交叉；这里的输出是读者设定的情景。"
        state={parity ? 'ready' : 'error'}
        stateDetail="电网平价数据当前不可用。请确认 API 已启动。"
      >
        {parity ? <GridParityWorkbench initial={parity} /> : null}
      </Panel>

      <Panel
        title={history ? `历史成本交叉（${history.region}）` : '历史成本交叉'}
        why="用逐年化石边际成本、光伏 LCOE 与 EU ETS 碳价，检验模型中的交叉机制是否与历史方向一致。"
        state={history ? 'ready' : 'error'}
        stateDetail="历史成本序列当前不可用，不能用模拟结果替代历史验证。"
      >
        {history ? (
          <div className="space-y-6">
            <GridHistoryChart points={history.points} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-muted">
                <thead>
                  <tr className="border-b border-line-strong text-left">
                    <th className="py-2 pr-4">年份</th>
                    <th className="py-2 pr-4 text-right">碳价</th>
                    <th className="py-2 pr-4 text-right">化石边际成本</th>
                    <th className="py-2 pr-4 text-right">光伏成本差</th>
                    <th className="py-2 pr-4">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {history.points.map((point) => (
                    <tr key={point.year} className="border-b border-line tabular-nums">
                      <td className="py-2 pr-4">{point.year}</td>
                      <td className="py-2 pr-4 text-right">€{point.carbon_price_eur_per_t.toFixed(0)}/t</td>
                      <td className="py-2 pr-4 text-right">€{point.fossil_marginal_cost_eur_per_mwh.toFixed(1)}</td>
                      <td className="py-2 pr-4 text-right">
                        {point.solar_gap_eur_per_mwh >= 0 ? '+' : ''}€{point.solar_gap_eur_per_mwh.toFixed(1)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block rounded-xl border px-2 py-0.5 text-xs font-medium ${gridStatusTone(point.status)}`}>
                          {gridStatusLabel(point.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-subtle">{history.disclaimer}</p>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="LCOE 敏感性"
        why="满负荷小时与 WACC 都是情景假设；矩阵显示这些假设如何移动可再生电力击败燃气发电所需的最低碳价。"
        state={lcoeSensitivity ? 'ready' : 'error'}
        stateDetail="LCOE 敏感性数据当前不可用，无法判断融资假设对交叉点的影响。"
      >
        {lcoeSensitivity ? <LcoeSensitivityMatrix initial={lcoeSensitivity} /> : null}
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'grid-parity-model',
            label: '电网平价 API（碳价由读者设定，成本交叉由模型计算）',
            asOf: parity?.generated_at ?? null,
            basis: 'assumption'
          },
          {
            id: 'grid-history',
            label: historyHasFallback ? '电网历史成本序列（含回退点）' : '电网历史成本与碳价序列',
            asOf: history?.generated_at ?? null,
            basis: historyHasFallback ? 'assumption' : 'derived'
          },
          {
            id: 'grid-lcoe-sensitivity',
            label: 'LCOE 敏感性矩阵（WACC、满负荷小时与技术选择均为情景输入）',
            asOf: lcoeSensitivity?.generated_at ?? null,
            basis: 'assumption'
          }
        ]}
        methodHref="https://github.com/wyl2607/jetscope/blob/main/docs/GRID_LCOE_METHODOLOGY.md"
        methodLabel="Grid LCOE methodology"
        limitations={[
          '下面的交叉点取决于你设的碳价，不是市场当前值。',
          'WACC、满负荷小时与燃料成本会共同移动交叉点；单一情景不能替代项目级尽调。',
          '历史序列若含回退点，会标为情景假设，不能当作完整市场观测引用。'
        ]}
      />
    </PageTemplate>
  );
}
