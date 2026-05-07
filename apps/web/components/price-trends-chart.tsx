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

type TimeWindow = '7d' | '30d' | 'all';

type MetricMeta = {
  label: string;
  shortLabel: string;
  axisUnit: string;
  explanation: string;
  comparison: string;
};

const TIME_WINDOWS: Array<{ key: TimeWindow; label: string; days: number | null }> = [
  { key: '7d', label: '近7天', days: 7 },
  { key: '30d', label: '近30天', days: 30 },
  { key: 'all', label: '全部历史', days: null }
];

const METRIC_META: Record<string, MetricMeta> = {
  brent_usd_per_bbl: {
    label: '布伦特原油',
    shortLabel: '布伦特',
    axisUnit: 'USD/bbl',
    explanation: '全球原油基准价，用于判断航油成本压力是否由上游原油驱动。',
    comparison: '适合与全球航油、欧盟航油代理价一起看，确认炼厂价差是否正在扩大。'
  },
  jet_usd_per_l: {
    label: '全球航油均价',
    shortLabel: '全球航油',
    axisUnit: 'USD/L',
    explanation: '全球 Jet-A 价格，用来判断航空燃料的基准成本走势。',
    comparison: '和欧盟航油代理价对比，可以看欧洲区域是否出现额外供应溢价。'
  },
  jet_eu_proxy_usd_per_l: {
    label: '欧盟航油代理价',
    shortLabel: '欧盟航油',
    axisUnit: 'USD/L',
    explanation: '欧洲航油代理价格，更贴近本页的储备压力和 SAF 替代判断。',
    comparison: '和全球航油均价对比，可以识别欧洲本地紧张程度；和 SAF 成本对比可判断拐点距离。'
  },
  carbon_proxy_usd_per_t: {
    label: '碳价代理',
    shortLabel: '碳价',
    axisUnit: 'USD/tCO2',
    explanation: '碳成本会推高化石航油的有效成本，因此会提前 SAF 盈亏平衡点。',
    comparison: '可与欧盟 ETS 配额走势一起看，判断碳成本是否在加速进入燃油决策。'
  }
};

function metricMetaFor(metricKey: string, unit?: string): MetricMeta {
  if (METRIC_META[metricKey]) return METRIC_META[metricKey];
  if (metricKey.includes('ets')) {
    return {
      label: '欧盟 ETS 配额',
      shortLabel: 'EU ETS',
      axisUnit: unit || 'EUR/tCO2',
      explanation: '欧盟排放配额价格，是欧洲航空碳成本压力的重要参考。',
      comparison: '和碳价代理一起看，可以判断代理值是否偏离实际 ETS 市场。'
    };
  }
  if (metricKey.includes('rotterdam')) {
    return {
      label: '鹿特丹航油',
      shortLabel: '鹿特丹',
      axisUnit: unit || 'USD/L',
      explanation: '鹿特丹航油反映欧洲枢纽现货压力，可作为欧盟航油代理价的复核点。',
      comparison: '和欧盟航油代理价、全球航油均价对比，可以识别欧洲供应紧张是否局部放大。'
    };
  }
  if (metricKey.includes('germany')) {
    return {
      label: '德国价格溢价',
      shortLabel: '德国溢价',
      axisUnit: unit || '%',
      explanation: '德国市场溢价用于观察区域燃油成本是否高于全球基准。',
      comparison: '和欧盟航油代理价一起看，可以判断区域溢价是否和欧洲供应压力同步。'
    };
  }

  const humanized = metricKey
    .replace(/_/g, ' ')
    .replace(/\busd\b/gi, 'USD')
    .replace(/\beur\b/gi, 'EUR');
  return {
    label: humanized,
    shortLabel: humanized,
    axisUnit: unit || 'value',
    explanation: '该指标来自本地历史库，适合用于辅助判断趋势方向。',
    comparison: '建议和布伦特原油、全球航油、欧盟航油代理价放在同一决策语境中复核。'
  };
}

function filterPointsByWindow(points: PricePoint[], timeWindow: TimeWindow): PricePoint[] {
  const finitePoints = (points ?? []).filter(
    (point) => Number.isFinite(point.value) && !Number.isNaN(new Date(point.as_of).getTime())
  );
  const windowConfig = TIME_WINDOWS.find((item) => item.key === timeWindow);
  if (!windowConfig?.days || finitePoints.length <= 1) return finitePoints;

  const latestTime = Math.max(...finitePoints.map((point) => new Date(point.as_of).getTime()));
  const cutoffTime = latestTime - windowConfig.days * 24 * 60 * 60 * 1000;
  const windowPoints = finitePoints.filter((point) => new Date(point.as_of).getTime() >= cutoffTime);
  return windowPoints.length >= 2 ? windowPoints : finitePoints.slice(-Math.min(finitePoints.length, windowConfig.days));
}

function formatDateLabel(value?: string): string {
  if (!value) return '暂无';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

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
  const metricMeta = metricMetaFor(metricKey);
  const finitePoints = (points ?? []).filter(
    (point) => Number.isFinite(point.value) && !Number.isNaN(new Date(point.as_of).getTime())
  );

  if (finitePoints.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-500"
        style={{ width, height }}
      >
        历史点暂不可用
      </div>
    );
  }

  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find min/max for scaling
  const values = finitePoints.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;
  const safeYRange = valueRange > 0 ? valueRange : Math.max(Math.abs(maxValue) * 0.1, 1);
  const paddingRange = safeYRange * 0.1;

  const yMin = valueRange > 0 ? minValue - paddingRange : minValue - safeYRange / 2;
  const yMax = valueRange > 0 ? maxValue + paddingRange : maxValue + safeYRange / 2;
  const chartYRange = yMax - yMin;

  // Convert data points to pixel coordinates
  const getX = (index: number) => padding.left + (index / (finitePoints.length - 1 || 1)) * chartWidth;
  const getY = (value: number) => padding.top + chartHeight - ((value - yMin) / chartYRange) * chartHeight;

  const formatAxisValue = (value: number) => {
    if (metricMeta.axisUnit.includes('%')) return `${value.toFixed(1)}%`;
    if (metricMeta.axisUnit.includes('/L')) return value.toFixed(2);
    return value.toFixed(0);
  };

  // Generate SVG path for line
  const pathData = finitePoints
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Parse dates for event markers
  const pointDates = finitePoints.map((p) => new Date(p.as_of).toISOString().split('T')[0]);
  const startDate = pointDates[0];
  const endDate = pointDates[pointDates.length - 1] ?? startDate;

  return (
    <svg width={width} height={height} className="rounded-lg bg-white">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={`grid-${ratio}`}
          x1={padding.left}
          y1={padding.top + chartHeight * ratio}
          x2={width - padding.right}
          y2={padding.top + chartHeight * ratio}
          stroke="#cbd5e1"
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
            fill="#64748b"
          >
            {formatAxisValue(value)}
          </text>
        );
      })}

      {/* Y-axis */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#94a3b8" strokeWidth="2" />
      <text x={padding.left} y={12} fontSize="11" fill="#475569">
        左轴：{metricMeta.axisUnit}
      </text>

      {/* X-axis */}
      <line x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} stroke="#94a3b8" strokeWidth="2" />
      <text x={width - padding.right} y={padding.top + chartHeight - 8} textAnchor="end" fontSize="11" fill="#475569">
        横轴：日期
      </text>

      {/* Data points */}
      {finitePoints.map((point, index) => (
        <circle
          key={`point-${index}`}
          cx={getX(index)}
          cy={getY(point.value)}
          r="3"
          fill="#60a5fa"
          stroke="#ffffff"
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
              <text x={x} y={padding.top + chartHeight + 25} textAnchor="middle" fontSize="10" fill="#475569" className="truncate">
                {event.label.substring(0, 8)}
              </text>
            </g>
          );
        })}

      {/* X-axis labels (start and end dates) */}
      <text x={padding.left} y={height - 8} fontSize="12" fill="#64748b">
        {formatDateLabel(startDate)}
      </text>
      <text x={width - padding.right} y={height - 8} textAnchor="end" fontSize="12" fill="#64748b">
        {formatDateLabel(endDate)}
      </text>
    </svg>
  );
}

// Skeleton loader
function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-64 rounded-lg bg-slate-100"></div>
      <div className="h-6 rounded bg-slate-100"></div>
    </div>
  );
}

export function PriceTrendsChart({ metrics, events = [], isLoading = false, error = null }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<string>(
    Object.keys(metrics).find((k) => k === 'brent_usd_per_bbl') || Object.keys(metrics)[0] || 'brent_usd_per_bbl'
  );
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');

  const metricKeys = useMemo(() => Object.keys(metrics), [metrics]);

  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-medium">价格趋势历史暂不可用</p>
        <p className="mt-1 text-sm text-amber-800">
          上方仍显示当前回退估算。将趋势变化用于决策前，请先复核来源质量。
        </p>
      </div>
    );
  }

  if (!metricKeys.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-500">
        <p>暂无可用指标</p>
      </div>
    );
  }

  const data = metrics[selectedMetric];

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-500">
        <p>所选指标暂无数据</p>
      </div>
    );
  }

  const selectedMeta = metricMetaFor(selectedMetric, data.unit);
  const windowPoints = filterPointsByWindow(data.points || [], timeWindow);
  const firstPoint = windowPoints[0] ?? null;
  const lastPoint = windowPoints[windowPoints.length - 1] ?? null;
  const windowChange = firstPoint && lastPoint && Math.abs(firstPoint.value) > 1e-9
    ? ((lastPoint.value - firstPoint.value) / firstPoint.value) * 100
    : null;
  const activeWindowLabel = TIME_WINDOWS.find((item) => item.key === timeWindow)?.label ?? '当前窗口';

  const getChangeClass = (value: number | null) => {
    if (value == null) return 'text-slate-500';
    const magnitude = Math.abs(value);
    if (magnitude >= 20) return 'text-rose-700';
    if (magnitude >= 10) return 'text-amber-700';
    return 'text-emerald-700';
  };

  const formatChange = (value: number | null) => {
    if (value == null) return '无数据';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <article className="rounded-2xl border border-sky-200 bg-sky-50/70 p-6">
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_0.75fr]">
        <div>
          <h3 className="text-lg font-medium text-slate-950">价格趋势</h3>
          <p className="mt-1 text-sm text-slate-600">
            像交易网站一样切换指标和时间窗口。左轴显示当前指标单位，横轴显示本地历史库日期。
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-white p-4 text-sm text-slate-700">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">当前指标</p>
          <p className="mt-2 font-semibold text-slate-950">{selectedMeta.label}</p>
          <p className="mt-2 leading-6">{selectedMeta.explanation}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{selectedMeta.comparison}</p>
        </div>
      </div>

      {/* Metric selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {metricKeys.map((key) => {
          const metric = metrics[key];
          const meta = metricMetaFor(key, metric.unit);
          const isSelected = key === selectedMetric;
          return (
            <button
              key={key}
              onClick={() => setSelectedMetric(key)}
              aria-pressed={isSelected}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isSelected ? 'bg-sky-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
              }`}
            >
              {meta.shortLabel}
            </button>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="时间窗口">
        {TIME_WINDOWS.map((item) => {
          const isSelected = item.key === timeWindow;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTimeWindow(item.key)}
              aria-pressed={isSelected}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                isSelected ? 'bg-slate-950 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-500'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="mb-6 overflow-x-auto">
        <LineChart points={windowPoints} metricKey={selectedMetric} events={events} width={600} height={300} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-950">当前窗口：{activeWindowLabel}</p>
        <p className="mt-1">
          样本 {windowPoints.length} 个，日期 {formatDateLabel(firstPoint?.as_of)} 至 {formatDateLabel(lastPoint?.as_of)}。
          窗口内变化 {formatChange(windowChange)}。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          左轴：{selectedMeta.axisUnit}；横轴：本地历史日期。若某个窗口样本不足，图表会保留可用历史点而不伪造数据。
        </p>
      </div>

      {/* Metrics display */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">最新值</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {data.latest_value?.toFixed(2) ?? '无数据'} {data.unit}
          </p>
          <p className="mt-1 text-xs text-slate-500">截至 {new Date(data.latest_as_of).toLocaleString('zh-CN')}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">1日</p>
          <p className={`mt-2 text-xl font-semibold ${getChangeClass(data.change_pct_1d)}`}>{formatChange(data.change_pct_1d)}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">7日</p>
          <p className={`mt-2 text-xl font-semibold ${getChangeClass(data.change_pct_7d)}`}>{formatChange(data.change_pct_7d)}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">30日</p>
          <p className={`mt-2 text-xl font-semibold ${getChangeClass(data.change_pct_30d)}`}>{formatChange(data.change_pct_30d)}</p>
        </div>
      </div>
    </article>
  );
}
