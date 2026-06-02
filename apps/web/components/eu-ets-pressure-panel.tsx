import type { EuEtsPressureViewModel } from '@/lib/eu-ets-pressure-read-model';

type Props = {
  model: EuEtsPressureViewModel;
};

const signalTone: Record<string, string> = {
  low: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  moderate: 'border-amber-300 bg-amber-50 text-amber-800',
  high: 'border-orange-300 bg-orange-50 text-orange-800',
  severe: 'border-rose-300 bg-rose-50 text-rose-800'
};

function formatUsd(value: number): string {
  return `$${value.toFixed(3)}/L`;
}

export function EuEtsPressurePanel({ model }: Props) {
  const tone = signalTone[model.signal] ?? 'border-slate-300 bg-slate-50 text-slate-700';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">EU ETS 碳压力</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">碳价对化石航油的成本压力</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            按给定 EU ETS 价格区间投影：每个价位下加到化石航油的碳成本、有效成本与压力百分比。价格路径为输入项，非内置假设。
          </p>
        </div>
        <span className={`rounded-lg border px-3 py-2 text-xs font-semibold ${tone}`}>
          压力信号：{model.signalLabel}
          {model.peakPressurePct !== null ? `（峰值 ${model.peakPressurePct.toFixed(1)}%）` : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-3 pr-4">EU ETS（€/t）</th>
              <th className="py-3 pr-4">碳成本</th>
              <th className="py-3 pr-4">有效化石成本</th>
              <th className="py-3">压力</th>
            </tr>
          </thead>
          <tbody>
            {model.points.map((point) => (
              <tr key={point.eu_ets_eur_per_t} className="border-b border-slate-200 last:border-none">
                <td className="py-3 pr-4 font-medium text-slate-950">€{point.eu_ets_eur_per_t.toFixed(0)}</td>
                <td className="py-3 pr-4">{formatUsd(point.carbon_cost_usd_per_l)}</td>
                <td className="py-3 pr-4">{formatUsd(point.effective_fossil_jet_usd_per_l)}</td>
                <td className="py-3">{point.pressure_pct === null ? '无数据' : `${point.pressure_pct.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        来源：{model.source.source_type} · 置信度 {Math.round(model.source.confidence_score * 100)}% · {model.source.updated_at} · {model.source.cadence}
      </p>
    </section>
  );
}
