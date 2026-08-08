import { FigureValue } from '@/components/figure-value';
import { derived, type Figure } from '@/lib/figure';
import type { TransitionSummaryResponse } from '@/lib/transition-read-model';

type Props = {
  summary: TransitionSummaryResponse;
};

type Lane = {
  key: string;
  label: string;
  breakeven: Figure;
  competitive: boolean;
};

const WIDTH = 660;
const LABEL_W = 168;
const RIGHT_PAD = 44;
const TOP = 40;
const ROW_H = 34;
const BOTTOM = 26;
const TRANSITION_SOURCE_ID = 'transition-summary';

function niceMax(value: number): number { // figure-contract-lint-ignore: axis rounding helper, not a prop
  return Math.max(100, Math.ceil(value / 20) * 20);
}

function breakevenFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null
): Figure {
  return derived({
    value,
    unit: 'EUR/t',
    sourceId: TRANSITION_SOURCE_ID,
    asOf,
    precision: 0,
    method: 'model-derived breakeven carbon price for cost parity (transition-summary)'
  });
}

export function TransitionLadder({ summary }: Props) {
  const lanes: Lane[] = summary.domains
    .flatMap((domain) =>
      domain.techs.map((tech) => ({
        key: `${domain.domain_key}:${tech.tech_key}`,
        label: `${domain.domain_name}· ${tech.name}`,
        breakeven: breakevenFigure(tech.breakeven_carbon_price_eur_per_t, summary.generated_at ?? null),
        competitive: tech.competitive_at_reference
      }))
    );

  // Unknown breakevens must not enter plot geometry (contract §3 / constraints §3.11).
  const plotLanes = lanes
    .filter((lane) => lane.breakeven.value != null)
    .sort((a, b) => {
      const left = a.breakeven.value;
      const right = b.breakeven.value;
      if (left == null || right == null) return 0;
      return left - right;
    });
  const unknownLanes = lanes.filter((lane) => lane.breakeven.value == null);

  const references = summary.domains.map((d) => ({
    label: `${d.carbon_driver} €${d.reference_carbon_price_eur_per_t.toFixed(0)}`,
    value: d.reference_carbon_price_eur_per_t
  }));

  const knownBreakevens = plotLanes.map((l) => l.breakeven.value).filter((v): v is number => v != null);
  const maxAxis = niceMax(
    Math.max(1, ...knownBreakevens, ...references.map((r) => r.value))
  );
  const trackW = WIDTH - LABEL_W - RIGHT_PAD;
  const x = (v: number) => LABEL_W + (Math.min(v, maxAxis) / maxAxis) * trackW; // figure-contract-lint-ignore: chart coordinate mapping, not a measurement
  const height = TOP + Math.max(plotLanes.length, 1) * ROW_H + BOTTOM;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxAxis * f));
  const refColors = ['#38bdf8', '#e879f9', '#fbbf24'];

  return (
    <div>
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

        {plotLanes.map((lane, i) => {
          const value = lane.breakeven.value;
          if (value == null) return null;
          const y = TOP + i * ROW_H + ROW_H / 2;
          const color = lane.competitive ? '#34d399' : '#fbbf24';
          return (
            <g key={lane.key}>
              <text x={0} y={y + 3} fontSize={11} fill="#cbd5e1">
                {lane.label}
              </text>
              <line x1={LABEL_W} y1={y} x2={WIDTH - RIGHT_PAD} y2={y} stroke="#334155" strokeWidth={1} />
              <circle cx={x(value)} cy={y} r={5} fill={color} />
              <foreignObject x={x(value) + 9} y={y - 10} width={120} height={22}>
                <div className="text-[10px] leading-none" style={{ color }}>
                  <FigureValue figure={lane.breakeven} locale="zh" size="inline" showTimestamp={false} />
                </div>
              </foreignObject>
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
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-subtle">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
          当前碳价下已具竞争力
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" />
          仍需更高碳价
        </span>
      </div>
      {unknownLanes.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {unknownLanes.map((lane) => (
            <li key={lane.key} className="flex flex-wrap items-baseline gap-2">
              <span>{lane.label}：打平碳价未知</span>
              <FigureValue figure={lane.breakeven} locale="zh" size="inline" showTimestamp={false} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-subtle">{summary.disclaimer}</p>
    </div>
  );
}
