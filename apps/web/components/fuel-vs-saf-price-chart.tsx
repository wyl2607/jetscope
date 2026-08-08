'use client';

import { FigureValue } from '@/components/figure-value';
import { formatFigure, type Figure } from '@/lib/figure';
import type { PathwayCostRow } from '@/lib/pathways-read-model';

type Props = {
  fossilJetUsdPerL: Figure;
  effectiveFossilJetUsdPerL: Figure;
  pathways: PathwayCostRow[];
};

const pathwayColorMap: Record<string, string> = {
  hefa: 'bg-series-1',
  atj: 'bg-series-2',
  ft: 'bg-series-3',
  ptl: 'bg-series-4'
};

export function FuelVsSafPriceChart({
  fossilJetUsdPerL,
  effectiveFossilJetUsdPerL,
  pathways
}: Props) {
  // Axis scale: only known values. Unknown never becomes 0 (would skew the range).
  const knownValues = [
    fossilJetUsdPerL.value,
    effectiveFossilJetUsdPerL.value,
    ...pathways.flatMap((item) => [item.netCostLow.value, item.netCostHigh.value])
  ].filter((value): value is number => value != null);
  const maxValue = Math.max(...knownValues, 1);

  const unknownNotes: string[] = [];
  if (fossilJetUsdPerL.value == null) {
    unknownNotes.push(`化石航油现货未知${fossilJetUsdPerL.reason ? `（${fossilJetUsdPerL.reason}）` : ''}`);
  }
  if (effectiveFossilJetUsdPerL.value == null) {
    unknownNotes.push(
      `有效化石航油成本未知${effectiveFossilJetUsdPerL.reason ? `（${effectiveFossilJetUsdPerL.reason}）` : ''}`
    );
  }
  for (const pathway of pathways) {
    if (pathway.netCostLow.value == null || pathway.netCostHigh.value == null) {
      const reasons = [pathway.netCostLow.reason, pathway.netCostHigh.reason].filter(Boolean);
      unknownNotes.push(
        `${pathway.display_name} 净成本区间未知${reasons.length ? `（${reasons.join('；')}）` : ''}`
      );
    }
  }

  return (
    // Bare artifact: card, title and why-line come from the wrapping Panel.
    <div>
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface-muted p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">化石航油现货</p>
              <p className="mt-1 text-xs text-muted">纳入碳成本压力前的当前观察价格。</p>
            </div>
            <p className="text-xl font-semibold text-ink">
              <FigureValue figure={fossilJetUsdPerL} locale="zh" size="inline" showTimestamp={false} />
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
            {fossilJetUsdPerL.value != null ? (
              <div
                className="h-full rounded-full bg-ink"
                style={{ width: `${Math.max(6, (fossilJetUsdPerL.value / maxValue) * 100)}%` }}
              />
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-muted p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">有效化石航油成本</p>
              <p className="mt-1 text-xs text-muted">包含所选掺混假设下的模型化碳成本压力。</p>
            </div>
            <p className="text-xl font-semibold text-ink">
              <FigureValue figure={effectiveFossilJetUsdPerL} locale="zh" size="inline" showTimestamp={false} />
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
            {effectiveFossilJetUsdPerL.value != null ? (
              <div
                className="h-full rounded-full bg-muted"
                style={{ width: `${Math.max(6, (effectiveFossilJetUsdPerL.value / maxValue) * 100)}%` }}
              />
            ) : null}
          </div>
        </div>

        <div className="grid gap-3">
          {pathways.map((pathway) => {
            const low = pathway.netCostLow.value;
            const high = pathway.netCostHigh.value;
            const widthLow = low != null ? Math.max(4, (low / maxValue) * 100) : null;
            const widthHigh =
              high != null
                ? Math.max(widthLow != null ? widthLow + 4 : 4, (high / maxValue) * 100)
                : null;
            const color = pathwayColorMap[pathway.pathway_key] ?? 'bg-line-strong';
            const statusColor =
              pathway.status === 'competitive'
                ? 'text-success'
                : pathway.status === 'inflection'
                  ? 'text-warning'
                  : 'text-danger';

            return (
              <div key={pathway.pathway_key} className="rounded-xl border border-line bg-surface/90 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{pathway.display_name}</p>
                    <p className={`mt-1 text-xs uppercase tracking-[0.18em] ${statusColor}`}>{pathway.status}</p>
                  </div>
                  <p className="text-sm text-ink">
                    {formatFigure(pathway.netCostLow)} 至 {formatFigure(pathway.netCostHigh)}
                  </p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-line">
                  {widthHigh != null ? (
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${widthHigh}%` }}
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>相对有效化石航油价差</span>
                  <span>
                    {formatFigure(pathway.spreadLow)} 至 {formatFigure(pathway.spreadHigh)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {unknownNotes.length > 0 ? (
          <p className="text-xs text-muted">
            未进入绘图：{unknownNotes.join('；')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
