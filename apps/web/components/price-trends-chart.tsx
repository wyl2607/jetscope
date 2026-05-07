'use client';

import { useState, useMemo } from 'react';

type PricePoint = {
  as_of: string;
  value: number;
};

type MarketEvent = {
  date: string;
  label: string;
  type: 'lufthansa' | 'breakeven' | 'shock';
};

type PriceTrendData = {
  metric_key: string;
  unit: string;
  latest_value: number;
  latest_as_of: string;
  change_pct_1d: number | null;
  change_pct_7d: number | null;
  change_pct_30d: number | null;
  points: PricePoint[];
};

type Props = {
  metrics: Record<string, PriceTrendData>;
  events?: MarketEvent[];
  isLoading?: boolean;
  error?: string | null;
};

// LineChart component
function LineChart({
  points,
  width = 600,
  height = 300,
  metricKey,
  events = []
}: {
  points: PricePoint[];
  width?: number;
  height?: number;
  metricKey: string;
  events?: MarketEvent[];
}) {
  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center bg-slate-800/30 p-4 text-slate-400" style={{ width, height }}>
        暂无数据
      </div>
    );
  }

  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find min/max for scaling
  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;
  const padding_range = valueRange * 0.1;

  const yMin = minValue - padding_range;
  const yMax = maxValue + padding_range;
  const yRange = yMax - yMin;

  // Convert data points to pixel coordinates
  const getX = (index: number) => padding.left + (index / (points.length - 1 || 1)) * chartWidth;
  const getY = (value: number) => padding.top + chartHeight - ((value - yMin) / yRange) * chartHeight;

  // Generate SVG path for line
  const pathData = points
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Parse dates for event markers
  const pointDates = points.map((p) => new Date(p.as_of).toISOString().split('T')[0]);
  const startDate = pointDates[0];
  const endDate = pointDates[pointDates.length - 1];

  return (
    <svg width={width} height={height} className="bg-slate-800/10 rounded-lg">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={`grid-${ratio}`}
          x1={padding.left}
          y1={padding.top + chartHeight * ratio}
          x2={width - padding.right}
          y2={padding.top + chartHeight * ratio}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4"
        />
      ))}

      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = yMax - (yMax - yMin) * ratio;
        return (
          <text
            key={`label-${ratio}`}
            x={padding.left - 10}
            y={padding.top + chartHeight * ratio + 5}
            textAnchor="end"
            fontSize="12"
            fill="#94a3b8"
          >
            {value.toFixed(0)}
          </text>
        );
      })}

      {/* Y-axis */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#64748b" strokeWidth="2" />

      {/* X-axis */}
      <line x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} stroke="#64748b" strokeWidth="2" />

      {/* Data points */}
      {points.map((point, index) => (
        <circle
          key={`point-${index}`}
          cx={getX(index)}
          cy={getY(point.value)}
          r="3"
          fill="#60a5fa"
          stroke="white"
          strokeWidth="1"
        />
      ))}

      {/* Line path */}
      <path d={pathData} stroke="#60a5fa" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Event markers */}
      {events
        .filter((event) => {
          const eventDate = event.date.split('T')[0];
          return eventDate >= startDate && eventDate <= endDate;
        })
        .map((event, idx) => {
          const eventDate = event.date.split('T')[0];
          const pointIndex = pointDates.indexOf(eventDate);
          if (pointIndex === -1) return null;

          const x = getX(pointIndex);
          const eventColors: Record<MarketEvent['type'], string> = {
            lufthansa: '#f97316',
            breakeven: '#eab308',
            shock: '#ef4444'
          };

          return (
            <g key={`event-${idx}`}>
              <circle cx={x} cy={padding.top + chartHeight + 10} r="5" fill={eventColors[event.type]} opacity="0.7" />
              <text x={x} y={padding.top + chartHeight + 25} textAnchor="middle" fontSize="10" fill="#cbd5e1" className="truncate">
                {event.label.substring(0, 8)}
              </text>
            </g>
          );
        })}

      {/* X-axis labels (start and end dates) */}
      <text x={padding.left} y={height - 8} fontSize="12" fill="#94a3b8">
        {startDate}
      </text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fontSize="12" fill="#94a3b8">
        {endDate}
      </text>
    </svg>
  );
}

// Skeleton loader
function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-64 rounded-lg bg-slate-700/30"></div>
      <div className="h-6 rounded bg-slate-700/30"></div>
    </div>
  );
}

export function PriceTrendsChart({ metrics, events = [], isLoading = false, error = null }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<string>(
    Object.keys(metrics).find((k) => k === 'brent_usd_per_bbl') || Object.keys(metrics)[0] || 'brent_usd_per_bbl'
  );

  const metricKeys = useMemo(() => Object.keys(metrics), [metrics]);

  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-500/50 bg-amber-950/20 p-6 text-amber-100">
        <p className="font-medium">价格趋势历史暂不可用</p>
        <p className="mt-1 text-sm text-amber-200">
          上方仍显示当前回退估算。将趋势变化用于决策前，请先复核来源质量。
        </p>
      </div>
    );
  }

  if (!metricKeys.length) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-6 text-slate-400">
        <p>暂无可用指标</p>
      </div>
    );
  }

  const data = metrics[selectedMetric];

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-6 text-slate-400">
        <p>所选指标暂无数据</p>
      </div>
    );
  }

  const getChangeClass = (value: number | null) => {
    if (!value) return 'text-slate-400';
    const magnitude = Math.abs(value);
    if (magnitude >= 20) return 'text-rose-300';
    if (magnitude >= 10) return 'text-amber-300';
    return 'text-emerald-300';
  };

  const formatChange = (value: number | null) => {
    if (!value) return '无数据';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const metricLabels: Record<string, string> = {
    brent_usd_per_bbl: 'Brent Crude',
    jet_usd_per_l: '航煤（全球）',
    jet_eu_proxy_usd_per_l: '航煤（欧盟）',
    carbon_proxy_usd_per_t: '碳价（ETS）'
  };

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-white">价格趋势</h3>
        <p className="mt-1 text-sm text-slate-400">1日 / 7日 / 30日历史变化</p>
      </div>

      {/* Metric selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {metricKeys.map((key) => {
          const metric = metrics[key];
          const isSelected = key === selectedMetric;
          return (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isSelected ? 'bg-sky-500 text-white' : 'border border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {metricLabels[key as keyof typeof metricLabels] || key}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="mb-6 overflow-x-auto">
        <LineChart points={data.points || []} metricKey={selectedMetric} events={events} width={600} height={300} />
      </div>

      {/* Metrics display */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-slate-800/30 p-4">
          <p className="text-sm text-slate-400">最新值</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {data.latest_value?.toFixed(2) ?? '无数据'} {data.unit}
          </p>
          <p className="mt-1 text-xs text-slate-500">截至 {new Date(data.latest_as_of).toLocaleString('zh-CN')}</p>
        </div>

        <div className="rounded-lg bg-slate-800/30 p-4">
          <p className="text-sm text-slate-400">1日</p>
          <p className={`mt-2 text-xl font-semibold ${getChangeClass(data.change_pct_1d)}`}>{formatChange(data.change_pct_1d)}</p>
        </div>

        <div className="rounded-lg bg-slate-800/30 p-4">
          <p className="text-sm text-slate-400">7日</p>
          <p className={`mt-2 text-xl font-semibold ${getChangeClass(data.change_pct_7d)}`}>{formatChange(data.change_pct_7d)}</p>
        </div>

        <div className="rounded-lg bg-slate-800/30 p-4">
          <p className="text-sm text-slate-400">30日</p>
          <p className={`mt-2 text-xl font-semibold ${getChangeClass(data.change_pct_30d)}`}>{formatChange(data.change_pct_30d)}</p>
        </div>
      </div>
    </article>
  );
}
