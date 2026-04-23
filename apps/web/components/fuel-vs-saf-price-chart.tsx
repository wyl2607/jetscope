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
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-white">Fuel vs SAF price ladder</h3>
        <p className="mt-1 text-sm text-slate-400">
          Fossil jet baseline, carbon-adjusted effective cost, and pathway net-cost bands.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-rose-200">Fossil jet spot</p>
              <p className="mt-1 text-xs text-slate-400">Current observed market price before carbon pressure.</p>
            </div>
            <p className="text-xl font-semibold text-white">{formatUsd(fossilJetUsdPerL)}</p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-300"
              style={{ width: `${Math.max(6, (fossilJetUsdPerL / maxValue) * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-200">Effective fossil cost</p>
              <p className="mt-1 text-xs text-slate-400">Includes modeled carbon pressure at the selected blend assumptions.</p>
            </div>
            <p className="text-xl font-semibold text-white">{formatUsd(effectiveFossilJetUsdPerL)}</p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
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
                ? 'text-emerald-300'
                : pathway.status === 'inflection'
                  ? 'text-amber-300'
                  : 'text-rose-300';

            return (
              <div key={pathway.pathway_key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{pathway.display_name}</p>
                    <p className={`mt-1 text-xs uppercase tracking-[0.18em] ${statusColor}`}>{pathway.status}</p>
                  </div>
                  <p className="text-sm text-slate-300">
                    {formatUsd(pathway.net_cost_low_usd_per_l)} to {formatUsd(pathway.net_cost_high_usd_per_l)}
                  </p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${color}`}
                    style={{ width: `${widthHigh}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Spread vs effective fossil</span>
                  <span>
                    {pathway.spread_low_pct.toFixed(1)}% to {pathway.spread_high_pct.toFixed(1)}%
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
