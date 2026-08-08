import type { TippingPointReadModel } from '@/lib/product-read-model';
import { formatFigure } from '@/lib/figure';

type Props = {
  tippingPoint: TippingPointReadModel | null;
  selectedPathwayKey: string;
};

const barColors: Record<string, string> = {
  fossil: 'bg-gradient-to-r from-rose-500 to-red-300',
  effective: 'bg-gradient-to-r from-amber-500 to-yellow-300',
  hefa: 'bg-gradient-to-r from-emerald-500 to-emerald-300',
  atj: 'bg-gradient-to-r from-sky-500 to-sky-300',
  ft: 'bg-gradient-to-r from-amber-500 to-orange-300',
  ptl: 'bg-gradient-to-r from-violet-500 to-fuchsia-300'
};

function midpoint(low: number, high: number): number { // figure-contract-lint-ignore: internal arithmetic helper, not a prop
  return (low + high) / 2;
}

export function ScenarioCostStackChart({ tippingPoint, selectedPathwayKey }: Props) {
  if (!tippingPoint || tippingPoint.pathways.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-5">
        <div className="mb-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
            情景成本堆栈
          </h4>
          <p className="mt-2 text-sm text-slate-500">情景成本数据暂不可用。</p>
        </div>
      </section>
    );
  }

  const selectedPathway =
    tippingPoint.pathways.find((pathway) => pathway.pathway_key === selectedPathwayKey) ??
    tippingPoint.pathways[0];
  const fossilSpot = tippingPoint.inputs.fossilJetUsdPerL;
  const effectiveFossil = tippingPoint.effectiveFossilJetUsdPerL;
  // Either end unknown → midpoint is unknown. Never launder null into 0.
  const low = selectedPathway.netCostLow.value;
  const high = selectedPathway.netCostHigh.value;
  const selectedMidpoint = low != null && high != null ? midpoint(low, high) : null;
  const midpointUnknownReason =
    [selectedPathway.netCostLow.reason, selectedPathway.netCostHigh.reason]
      .filter(Boolean)
      .join('；') || '净成本区间任一端未知';
  const knownForScale = [fossilSpot, effectiveFossil, selectedMidpoint].filter(
    (value): value is number => value != null
  );
  const maxValue = Math.max(...knownForScale, 1);
  const rows = [
    {
      key: 'fossil',
      label: '化石航油现货',
      value: fossilSpot,
      hint: '观察到的市场价格',
    },
    {
      key: 'effective',
      label: '有效化石航油成本',
      value: effectiveFossil,
      hint: '现货价格叠加模型化碳成本压力',
    },
    {
      key: selectedPathway.pathway_key,
      label: `${selectedPathway.display_name} 中点`,
      value: selectedMidpoint,
      hint: `净成本区间 ${formatFigure(selectedPathway.netCostLow)}–${formatFigure(selectedPathway.netCostHigh)}`,
    }
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-5">
      <div className="mb-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
          情景成本堆栈
        </h4>
        <p className="mt-2 text-sm text-slate-500">
          紧凑对比化石航油现货成本、碳调整后成本与已选路径中点。
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <div>
                <div className="font-medium text-slate-950">{row.label}</div>
                <div className="text-xs text-slate-500">{row.hint}</div>
              </div>
              <div className="font-mono text-ink">
                {row.value == null ? '—' : `$${row.value.toFixed(2)}/L`}
              </div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              {row.value != null ? (
                <div
                  className={`h-full rounded-full ${barColors[row.key] ?? 'bg-gradient-to-r from-slate-500 to-slate-300'}`}
                  style={{ width: `${Math.max(6, (row.value / maxValue) * 100)}%` }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {selectedMidpoint == null ? (
        <p className="mt-3 text-xs text-muted">
          所选路径中点未进入绘图：{midpointUnknownReason}
        </p>
      ) : null}
    </section>
  );
}
