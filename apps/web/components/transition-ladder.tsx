import type { TransitionSummaryResponse } from '@/lib/transition-read-model';

type Props = {
  summary: TransitionSummaryResponse;
};

type Lane = {
  key: string;
  label: string;
  breakeven: number;
  competitive: boolean;
};

const WIDTH = 660;
const LABEL_W = 168;
const RIGHT_PAD = 44;
const TOP = 40;
const ROW_H = 34;
const BOTTOM = 26;

function niceMax(value: number): number {
  return Math.max(100, Math.ceil(value / 20) * 20);
}

export function TransitionLadder({ summary }: Props) {
  const lanes: Lane[] = summary.domains
    .flatMap((domain) =>
      domain.techs.map((tech) => ({
        key: `${domain.domain_key}:${tech.tech_key}`,
        label: `${domain.domain_name}· ${tech.name}`,
        breakeven: tech.breakeven_carbon_price_eur_per_t,
        competitive: tech.competitive_at_reference
      }))
    )
    .sort((a, b) => a.breakeven - b.breakeven);

  const references = summary.domains.map((d) => ({
    label: `${d.carbon_driver} €${d.reference_carbon_price_eur_per_t.toFixed(0)}`,
    value: d.reference_carbon_price_eur_per_t
  }));

  const maxAxis = niceMax(
    Math.max(...lanes.map((l) => l.breakeven), ...references.map((r) => r.value), 1)
  );
  const trackW = WIDTH - LABEL_W - RIGHT_PAD;
  const x = (v: number) => LABEL_W + (Math.min(v, maxAxis) / maxAxis) * trackW;
  const height = TOP + lanes.length * ROW_H + BOTTOM;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxAxis * f));
  const refColors = ['#38bdf8', '#e879f9', '#fbbf24'];

  return (
    <article className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-medium text-slate-50">脱碳碳价阶梯</h3>
        <span className="text-xs uppercase tracking-[0.16em] text-emerald-300">同一碳价 · 多域交叉</span>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        每个清洁技术击败其化石参照所需的最低碳价（€/t）。同一条 EU ETS / ETS2 价格轴贯穿电网与供暖两个脱碳前沿。
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label="各清洁技术跨越成本平价所需的碳价阶梯，含 EU ETS 与 ETS2 参考价"
      >
        {references.map((ref, i) => (
          <g key={`ref-${ref.label}`}>
            <line
              x1={x(ref.value)}
              y1={TOP - 8}
              x2={x(ref.value)}
              y2={height - BOTTOM}
              stroke={refColors[i % refColors.length]}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.8}
            />
            <text x={x(ref.value)} y={TOP - 14} textAnchor="middle" fontSize={9} fill={refColors[i % refColors.length]}>
              {ref.label}
            </text>
          </g>
        ))}

        {lanes.map((lane, i) => {
          const y = TOP + i * ROW_H + ROW_H / 2;
          const color = lane.competitive ? '#34d399' : '#fbbf24';
          return (
            <g key={lane.key}>
              <text x={0} y={y + 3} fontSize={11} fill="#cbd5e1">
                {lane.label}
              </text>
              <line x1={LABEL_W} y1={y} x2={WIDTH - RIGHT_PAD} y2={y} stroke="#334155" strokeWidth={1} />
              <circle cx={x(lane.breakeven)} cy={y} r={5} fill={color} />
              <text x={x(lane.breakeven) + 9} y={y + 3} fontSize={10} fill={color} fontFamily="monospace">
                €{lane.breakeven.toFixed(0)}/t
              </text>
            </g>
          );
        })}

        {axisTicks.map((tick) => (
          <g key={`tick-${tick}`}>
            <text x={x(tick)} y={height - 8} textAnchor="middle" fontSize={9} fill="#64748b">
              €{tick}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
          当前碳价下已具竞争力
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" />
          仍需更高碳价
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{summary.disclaimer}</p>
    </article>
  );
}
