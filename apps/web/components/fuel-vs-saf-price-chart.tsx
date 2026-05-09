'use client';

type PathwayRow = {
  pathway_key: string;
  display_name: string;
  net_cost_low_usd_per_l: number;
  net_cost_high_usd_per_l: number;
  spread_low_pct: number;
  spread_high_pct: number;
  status: string;
};

type Props = {
  fossilJetUsdPerL: number;
  effectiveFossilJetUsdPerL: number;
  pathways: PathwayRow[];
};

const pathwayColorMap: Record<string, string> = {
  hefa: 'from-emerald-500 to-emerald-300',
  atj: 'from-sky-500 to-sky-300',
  ft: 'from-amber-500 to-orange-300',
  ptl: 'from-violet-500 to-fuchsia-300'
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}/L`;
}

export function FuelVsSafPriceChart({
  fossilJetUsdPerL,
  effectiveFossilJetUsdPerL,
  pathways
}: Props) {
  const maxValue = Math.max(
    effectiveFossilJetUsdPerL,
    fossilJetUsdPerL,
    ...pathways.flatMap((item) => [item.net_cost_low_usd_per_l, item.net_cost_high_usd_per_l]),
    1
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-slate-950">航油与 SAF 价格阶梯</h3>
        <p className="mt-1 text-sm text-slate-600">
          化石航油基准、碳调整后有效成本与各路径净成本区间。
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-rose-700">化石航油现货</p>
              <p className="mt-1 text-xs text-slate-600">纳入碳成本压力前的当前观察价格。</p>
            </div>
            <p className="text-xl font-semibold text-slate-950">{formatUsd(fossilJetUsdPerL)}</p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-300"
              style={{ width: `${Math.max(6, (fossilJetUsdPerL / maxValue) * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-800">有效化石航油成本</p>
              <p className="mt-1 text-xs text-slate-600">包含所选掺混假设下的模型化碳成本压力。</p>
            </div>
            <p className="text-xl font-semibold text-slate-950">{formatUsd(effectiveFossilJetUsdPerL)}</p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
              style={{ width: `${Math.max(6, (effectiveFossilJetUsdPerL / maxValue) * 100)}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3">
          {pathways.map((pathway) => {
            const widthLow = Math.max(4, (pathway.net_cost_low_usd_per_l / maxValue) * 100);
            const widthHigh = Math.max(widthLow + 4, (pathway.net_cost_high_usd_per_l / maxValue) * 100);
            const color = pathwayColorMap[pathway.pathway_key] ?? 'from-slate-500 to-slate-300';
            const statusColor =
              pathway.status === 'competitive'
                ? 'text-emerald-700'
                : pathway.status === 'inflection'
                  ? 'text-amber-700'
                  : 'text-rose-700';

            return (
              <div key={pathway.pathway_key} className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-950">{pathway.display_name}</p>
                    <p className={`mt-1 text-xs uppercase tracking-[0.18em] ${statusColor}`}>{pathway.status}</p>
                  </div>
                  <p className="text-sm text-slate-700">
                    {formatUsd(pathway.net_cost_low_usd_per_l)} 至 {formatUsd(pathway.net_cost_high_usd_per_l)}
                  </p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${color}`}
                    style={{ width: `${widthHigh}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                  <span>相对有效化石航油价差</span>
                  <span>
                    {pathway.spread_low_pct.toFixed(1)}% 至 {pathway.spread_high_pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
