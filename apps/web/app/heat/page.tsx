import type { Metadata } from 'next';
import { HeatParityWorkbench } from '@/components/heat-parity-workbench';
import { HeatSensitivityMatrix } from '@/components/heat-sensitivity-matrix';
import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import {
  type HeatParityResponse,
  type HeatSensitivityResponse,
  heatSignalLabel,
  loadHeatParity,
  loadHeatSensitivity
} from '@/lib/heat-parity-read-model';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '供暖平价分析',
  description:
    '交互式分析空气源/地源热泵相对燃气冷凝锅炉在何种 EU ETS2 碳价下跨越供暖成本平价。',
  path: '/heat'
});

function formatEur(value: number): string {
  return `€${value.toFixed(1)}`;
}

export default async function HeatParityPage() {
  let parity: HeatParityResponse | null = null;
  let sensitivity: HeatSensitivityResponse | null = null;
  let parityError: string | null = null;
  let sensitivityError: string | null = null;

  try {
    parity = await loadHeatParity();
  } catch {
    parityError = '供暖平价接口无响应。本地请确认 API 已启动：npm run api:dev';
  }
  try {
    sensitivity = await loadHeatSensitivity();
  } catch {
    sensitivityError = '敏感性接口无响应，矩阵暂不可用。上方的平价结论不受影响。';
  }

  const best = parity?.rows?.[0] ?? null;

  return (
    <PageTemplate
      eyebrow="能源转型情报"
      title="供暖平价分析"
      question="在当前 ETS2 碳价下，热泵的每 MWh 有用热成本是否已经低于燃气锅炉？"
      asOf={parity?.generated_at ?? null}
    >
      <SignalRow label="关键信号">
        <MetricCard
          label="总体信号"
          value={parity ? heatSignalLabel(parity.signal) : '—'}
          hint={parity ? '基于当前碳价与能源价格的直接成本对比' : '接口无响应，暂无结论'}
        />
        <MetricCard
          label="ETS2 碳价"
          value={parity ? `€${parity.inputs.carbon_price_eur_per_t.toFixed(0)}/t` : '—'}
          hint="驱动三域交叉的同一个碳价输入"
        />
        <MetricCard
          label="居民电价"
          value={parity ? `${formatEur(parity.inputs.elec_price_eur_per_mwh_el)}/MWh` : '—'}
          hint="热泵侧成本的分子，除以 COP 得到有用热成本"
        />
        <MetricCard
          label="居民燃气价"
          value={parity ? `${formatEur(parity.inputs.gas_price_eur_per_mwh_th)}/MWh` : '—'}
          hint="燃气侧成本，另需按锅炉效率折算并叠加碳成本"
        />
      </SignalRow>

      <Panel
        title="平价工作台"
        why="调整碳价与能源价格，看热泵相对燃气锅炉的成本差如何移动，以及在哪个碳价上越过零线。"
        state={parity ? 'ready' : 'error'}
        stateDetail={parityError ?? undefined}
      >
        {parity ? <HeatParityWorkbench initial={parity} /> : null}
      </Panel>

      <Panel
        title="敏感性矩阵"
        why="同时改变电价与碳价，找出结论翻转的边界，而不是只看单一情景。"
        state={sensitivity ? 'ready' : 'error'}
        stateDetail={sensitivityError ?? undefined}
      >
        {sensitivity ? <HeatSensitivityMatrix initial={sensitivity} /> : null}
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'heat-parity-api',
            label: 'JetScope 供暖平价接口（居民电价、燃气价、ETS2 碳价）',
            asOf: parity?.generated_at ?? null,
            basis: 'observed'
          },
          {
            id: 'heat-parity-derivation',
            label: `燃气侧按锅炉效率折算、热泵侧按 COP 折算的每 MWh 有用热成本${
              best ? `（当前最优：${best.tech_key}）` : ''
            }`,
            basis: 'derived'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '成本单位为 €/MWh 有用热，仅比较直接运行成本，不含设备投资与安装。',
          '电力上游排放不纳入本次直接对比范围。',
          'COP 与锅炉效率取参考值，实际机组与建筑条件会改变结论。'
        ]}
      />
    </PageTemplate>
  );
}
