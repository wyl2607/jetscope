import type { GridHistoryResponse } from '@/lib/grid-parity-read-model';

type Point = GridHistoryResponse['points'][number];

type Props = {
  points: Point[];
};

const WIDTH = 560;
const HEIGHT = 220;
const PAD = { top: 16, right: 48, bottom: 28, left: 44 };

function buildLine(
  points: Point[],
  value: (p: Point) => number,
  x: (i: number) => number,
  y: (v: number) => number
): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value(p)).toFixed(1)}`)
    .join(' ');
}

export function GridHistoryChart({ points }: Props) {
  if (points.length < 2) return null;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const costValues = points.flatMap((p) => [
    p.fossil_marginal_cost_eur_per_mwh,
    p.solar_lcoe_eur_per_mwh
  ]);
  const costMin = Math.min(...costValues);
  const costMax = Math.max(...costValues);
  const costSpan = costMax - costMin || 1;
  const carbonMax = Math.max(...points.map((p) => p.carbon_price_eur_per_t), 1);

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const yCost = (v: number) => PAD.top + innerH - ((v - costMin) / costSpan) * innerH;
  const yCarbon = (v: number) => PAD.top + innerH - (v / carbonMax) * innerH;

  const fossilLine = buildLine(points, (p) => p.fossil_marginal_cost_eur_per_mwh, x, yCost);
  const solarLine = buildLine(points, (p) => p.solar_lcoe_eur_per_mwh, x, yCost);
  const carbonLine = buildLine(points, (p) => p.carbon_price_eur_per_t, x, yCarbon);

  const costTicks = [costMin, (costMin + costMax) / 2, costMax];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full"
        role="img"
        aria-label="逐年化石边际成本、光伏 LCOE 与 EU ETS 碳价趋势，含成本交叉点"
      >
        {costTicks.map((v) => (
          <g key={`tick-${v.toFixed(1)}`}>
            <line
              x1={PAD.left}
              y1={yCost(v)}
              x2={WIDTH - PAD.right}
              y2={yCost(v)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={yCost(v) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              €{v.toFixed(0)}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          <text
            key={`year-${p.year}`}
            x={x(i)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize={9}
            fill="#94a3b8"
          >
            {p.year}
          </text>
        ))}

        <path d={carbonLine} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
        <path d={fossilLine} fill="none" stroke="#64748b" strokeWidth={2} />
        <path d={solarLine} fill="none" stroke="#059669" strokeWidth={2} />

        {points.map((p, i) =>
          p.solar_gap_eur_per_mwh <= 0 ? (
            <circle key={`win-${p.year}`} cx={x(i)} cy={yCost(p.solar_lcoe_eur_per_mwh)} r={3} fill="#059669" />
          ) : null
        )}

        <text x={WIDTH - PAD.right + 6} y={PAD.top + 4} fontSize={9} fill="#d97706">
          €{carbonMax.toFixed(0)}/t
        </text>
        <text x={WIDTH - PAD.right + 6} y={PAD.top + innerH} fontSize={9} fill="#d97706">
          €0/t
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: '#64748b' }} aria-hidden="true" />
          化石边际成本
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: '#059669' }} aria-hidden="true" />
          光伏 LCOE
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-b border-dashed" style={{ borderColor: '#f59e0b' }} aria-hidden="true" />
          碳价（右轴）
        </span>
        <span>● 标记＝光伏已更便宜</span>
      </figcaption>
    </figure>
  );
}
