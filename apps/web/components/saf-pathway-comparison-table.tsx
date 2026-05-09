import { listCanonicalPathways } from '@core/aviation/pathways';

type TippingPointPathway = {
  pathway_key: string;
  display_name: string;
  net_cost_low_usd_per_l: number;
  net_cost_high_usd_per_l: number;
  spread_low_pct: number;
  spread_high_pct: number;
  status: string;
};

type Props = {
  pathways: TippingPointPathway[];
  selectedPathwayKey: string;
};

const maturityLabels: Record<string, string> = {
  commercial: '商业化',
  scaling: '扩规模',
  limited: '受限',
  future: '未来路径'
};

const canonicalByKey = new Map<string, (typeof listCanonicalPathways extends () => (infer T)[] ? T : never)>(
  listCanonicalPathways().map((pathway) => [pathway.pathwayKey, pathway])
);

function formatRange(low: number, high: number): string {
  return `$${low.toFixed(2)}–$${high.toFixed(2)}/L`;
}

export function SafPathwayComparisonTable({ pathways, selectedPathwayKey }: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-5">
      <div className="mb-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
          SAF 路径对比
        </h4>
        <p className="mt-2 text-sm text-slate-500">
          标准路径目录，叠加拐点合约返回的实时净成本区间。
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-3 pr-4">路径</th>
              <th className="py-3 pr-4">净成本</th>
              <th className="py-3 pr-4">CO₂ 减排</th>
              <th className="py-3 pr-4">成熟度</th>
              <th className="py-3 pr-4">状态</th>
              <th className="py-3">价差</th>
            </tr>
          </thead>
          <tbody>
            {pathways.map((pathway) => {
              const canonical = canonicalByKey.get(pathway.pathway_key);
              const isSelected = pathway.pathway_key === selectedPathwayKey;
              const rowClass = isSelected ? 'bg-sky-50 ring-1 ring-sky-300' : '';
              const statusColor =
                pathway.status === 'competitive'
                  ? 'text-emerald-700'
                  : pathway.status === 'inflection'
                    ? 'text-amber-700'
                    : 'text-rose-700';
              return (
                <tr key={pathway.pathway_key} className={`border-b border-slate-200 last:border-none ${rowClass}`}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-950">{pathway.display_name}</div>
                    <div className="text-xs text-slate-500">{pathway.pathway_key}</div>
                  </td>
                  <td className="py-3 pr-4">
                    {formatRange(pathway.net_cost_low_usd_per_l, pathway.net_cost_high_usd_per_l)}
                  </td>
                  <td className="py-3 pr-4">
                    {canonical
                      ? `${canonical.carbonReductionLowPct.toFixed(0)}–${canonical.carbonReductionHighPct.toFixed(0)}%`
                      : '无数据'}
                  </td>
                  <td className="py-3 pr-4">
                    {canonical ? maturityLabels[canonical.maturityLevel] ?? canonical.maturityLevel : '无数据'}
                  </td>
                  <td className={`py-3 pr-4 font-medium ${statusColor}`}>{pathway.status}</td>
                  <td className="py-3">
                    {pathway.spread_low_pct.toFixed(1)}% 至 {pathway.spread_high_pct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
