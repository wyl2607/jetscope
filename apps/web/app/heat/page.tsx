import type { Metadata } from 'next';
import { HeatParityWorkbench } from '@/components/heat-parity-workbench';
import { HeatSensitivityMatrix } from '@/components/heat-sensitivity-matrix';
import { Shell } from '@/components/shell';
import {
  type HeatParityResponse,
  type HeatSensitivityResponse,
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

export default async function HeatParityPage() {
  let parity: HeatParityResponse | null = null;
  let sensitivity: HeatSensitivityResponse | null = null;
  try {
    parity = await loadHeatParity();
  } catch {
    parity = null;
  }
  try {
    sensitivity = await loadHeatSensitivity();
  } catch {
    sensitivity = null;
  }

  return (
    <Shell
      eyebrow="能源转型情报"
      title="供暖平价分析"
      description="热泵 vs 燃气锅炉 + EU ETS2 建筑燃料碳成本：同一碳价驱动 SAF、电网、供暖三域的成本交叉信号。"
    >
      {parity ? (
        <div className="space-y-6">
          <HeatParityWorkbench initial={parity} />

          {sensitivity && <HeatSensitivityMatrix initial={sensitivity} />}

          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Methodology</p>
            <h3 className="mt-2 text-lg font-medium text-slate-950">方法论</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              成本单位为 €/MWh 有用热。燃气侧将居民燃气价格和 ETS2 建筑/供暖燃料碳价按锅炉效率折算；热泵侧用居民电价除以 COP。电力上游碳排放不纳入本直接对比范围。
            </p>
          </article>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          供暖平价数据当前不可用。请确认 API 已启动（本地：<code className="font-mono">npm run api:dev</code>）。
        </div>
      )}
    </Shell>
  );
}
