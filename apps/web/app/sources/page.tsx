import { InfoCard } from '@/components/cards';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { Shell } from '@/components/shell';
import { getSourcesReadModel, type SourcesReadModel } from '@/lib/sources-read-model';
import type { Metadata, Route } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { FocusScroll } from './focus-scroll';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '来源',
  description:
    '查看 JetScope 来源溯源、置信度、滞后、回退状态与实时市场来源健康度。',
  path: '/sources'
});

type SourceRow = SourcesReadModel['rows'][number];
type SourceFilter = 'all' | 'review' | 'fallback' | 'proxy' | 'live';

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string; hint: string }> = [
  { key: 'all', label: '全部', hint: '完整矩阵' },
  { key: 'review', label: '需复核', hint: '回退、降级、代理或波动警报' },
  { key: 'fallback', label: '回退', hint: '当前依赖回退路径' },
  { key: 'proxy', label: '代理', hint: '代理或派生估算' },
  { key: 'live', label: '实时', hint: '实时主来源或官方来源' }
];

function normalizeSourceFilter(filter: string | undefined): SourceFilter {
  if (filter === 'review' || filter === 'fallback' || filter === 'proxy' || filter === 'live') {
    return filter;
  }
  return 'all';
}

function rowMatchesSourceFilter(row: SourceRow, filter: SourceFilter) {
  if (filter === 'all') return true;
  if (filter === 'review') {
    return row.trustState !== 'live' || row.alertLevel !== 'normal' || row.status !== 'ok';
  }
  if (filter === 'fallback') return row.trustState === 'fallback' || row.status === 'seed' || row.status === 'fallback';
  if (filter === 'proxy') return row.trustState === 'proxy' || row.sourceType.includes('代理') || row.sourceType.includes('派生');
  return row.trustState === 'live';
}

export default async function SourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const filterRaw = resolvedParams?.filter;
  const focusMetricKey = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const activeFilter = normalizeSourceFilter(Array.isArray(filterRaw) ? filterRaw[0] : filterRaw);
  const readModel = await getSourcesReadModel();
  const visibleRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, activeFilter));
  const sourceFilterHref = (filter: SourceFilter) => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('filter', filter);
    if (focusMetricKey) params.set('focus', focusMetricKey);
    const query = params.toString();
    return (query ? `/sources?${query}` : '/sources') as Route;
  };
  const sourceFocusHref = (metricKey: string) => {
    const params = new URLSearchParams();
    if (activeFilter !== 'all') params.set('filter', activeFilter);
    params.set('focus', metricKey);
    return `/sources?${params.toString()}` as Route;
  };
  const clearFocusHref = (activeFilter === 'all' ? '/sources' : `/sources?filter=${activeFilter}`) as Route;

  const alertLabel = (level: "normal" | "watch" | "alert") => {
    if (level === "alert") return "警报";
    if (level === "watch") return "观察";
    return "正常";
  };

  const alertColor = (level: "normal" | "watch" | "alert") => {
    if (level === "alert") return "text-rose-700";
    if (level === "watch") return "text-amber-700";
    return "text-emerald-700";
  };

  const sparklineDataUrl = (encoded: string) => {
    if (!encoded) return null;
    const values = encoded
      .split(",")
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isFinite(item));
    if (values.length < 2) return null;
    const width = 120;
    const height = 28;
    const step = width / (values.length - 1);
    const points = values
      .map((value, index) => {
        const x = Number((index * step).toFixed(2));
        const y = Number((height - (value / 100) * height).toFixed(2));
        return `${x},${y}`;
      })
      .join(" ");
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
      `<polyline fill='none' stroke='rgb(56 189 248)' stroke-width='2' points='${points}'/>` +
      `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const trustClass = (state: string) => {
    if (state === 'live') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (state === 'proxy') return 'border-sky-200 bg-sky-50 text-sky-800';
    if (state === 'fallback') return 'border-amber-200 bg-amber-50 text-amber-800';
    return 'border-rose-200 bg-rose-50 text-rose-700';
  };

  const trustLabel = (state: string) => {
    if (state === 'live') return '实时';
    if (state === 'proxy') return '代理';
    if (state === 'fallback') return '回退';
    if (state === 'degraded') return '降级';
    return state;
  };

  const sourceTypeLabel = (sourceType: string) => {
    if (sourceType === 'market primary') return '市场主要来源';
    if (sourceType === 'public proxy') return '公开代理';
    if (sourceType === 'regulatory proxy') return '监管代理';
    if (sourceType === 'derived proxy') return '派生代理';
    if (sourceType === 'official') return '官方';
    if (sourceType === 'unknown') return '未知';
    return sourceType;
  };

  const statusLabel = (status: string) => {
    if (status === 'ok') return '正常';
    if (status === 'seed') return '种子回退';
    if (status === 'fallback') return '回退';
    if (status === 'error') return '异常';
    if (status === 'unknown') return '未知';
    return status;
  };

  return (
    <Shell
      eyebrow="来源目录"
      title="来源与溯源视图"
      description="在用于决策前，检查每个市场输入是实时、代理还是估算。"
    >
      <FocusScroll focusMetricKey={focusMetricKey} />
      <div className="mb-6">
        <ProvenanceSummary
          summary={readModel.summary}
          completeness={readModel.completeness}
          generatedAt={readModel.generatedAt}
        />
      </div>
      <div className="mb-6">
        <SourceCoveragePanel
          metrics={readModel.coverageMetrics}
          completeness={readModel.completeness}
          degraded={readModel.degraded}
          title="来源覆盖"
          subtitle={`${readModel.coverageMetrics.length} 个 canonical metrics · 最近更新 ${new Date(readModel.generatedAt).toLocaleString()}`}
        />
      </div>
      <InfoCard title="市场输入矩阵" subtitle={`总体状态：${readModel.overallStatus}`}>
        <p className="mb-3 text-xs text-slate-600">
          生成于 {new Date(readModel.generatedAt).toLocaleString()}
          {readModel.isFallback ? ' · 实时来源覆盖不可用时显示回退估算' : ''}
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SOURCE_FILTERS.map((filter) => {
            const count = readModel.rows.filter((row) => rowMatchesSourceFilter(row, filter.key)).length;
            const isActive = activeFilter === filter.key;
            return (
              <Link
                key={filter.key}
                href={sourceFilterHref(filter.key)}
                className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border-sky-500 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
                }`}
                title={filter.hint}
              >
                {filter.label} <span className="ml-1 text-slate-500">{count}</span>
              </Link>
            );
          })}
          <span className="text-xs text-slate-500">
            正在显示 {visibleRows.length} / {readModel.rows.length}
          </span>
        </div>
        {focusMetricKey ? (
          <p className="mb-3 text-xs text-sky-700">
            已从驾驶舱风险信号聚焦：<code>{focusMetricKey}</code>{' '}
            <Link href={clearFocusHref} className="underline text-sky-800">
              清除
            </Link>
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-3 pr-4">界面</th>
                <th className="py-3 pr-4">来源</th>
                <th className="py-3 pr-4">可信状态</th>
                <th className="py-3 pr-4">范围</th>
                <th className="py-3 pr-4">置信度</th>
                <th className="py-3 pr-4">滞后</th>
                <th className="py-3 pr-4">状态</th>
                <th className="py-3 pr-4">数值</th>
                <th className="py-3 pr-4">1d</th>
                <th className="py-3 pr-4">7d</th>
                <th className="py-3 pr-4">30d</th>
                <th className="py-3 pr-4">波动</th>
                <th className="py-3 pr-4">趋势</th>
                <th className="py-3 pr-4">操作</th>
                <th className="py-3">可信原因 / 降级原因</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.surface}
                  id={`metric-${row.metricKey}`}
                  className={`border-b border-slate-200 ${
                    focusMetricKey === row.metricKey
                      ? 'ring-1 ring-sky-400/60 bg-sky-50'
                      : row.alertLevel === 'alert'
                      ? 'bg-rose-50'
                      : row.alertLevel === 'watch'
                        ? 'bg-amber-50'
                        : ''
                  }`}
                >
                  <td className="py-3 pr-4 font-medium text-slate-950">{row.surface}</td>
                  <td className="py-3 pr-4">{row.source}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] ${trustClass(row.trustState)}`}>
                      {trustLabel(row.trustState)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{sourceTypeLabel(row.sourceType)}</span>
                  </td>
                  <td className="py-3 pr-4">{row.scope}</td>
                  <td className="py-3 pr-4">{row.confidence}</td>
                  <td className="py-3 pr-4">{row.lag}</td>
                  <td className="py-3 pr-4">{statusLabel(row.status)}</td>
                  <td className="py-3 pr-4">{row.value}</td>
                  <td className="py-3 pr-4">{row.change1d}</td>
                  <td className="py-3 pr-4">{row.change7d}</td>
                  <td className="py-3 pr-4">{row.change30d}</td>
                  <td className={`py-3 pr-4 font-medium ${alertColor(row.alertLevel)}`}>
                    {alertLabel(row.alertLevel)}
                  </td>
                  <td className="py-3 pr-4">
                    {sparklineDataUrl(row.sparkline) ? (
                      <img
                        src={sparklineDataUrl(row.sparkline) ?? ""}
                        alt={`${row.surface} 趋势`}
                        width={120}
                        height={28}
                      />
                    ) : (
                      <span className="text-slate-500">n/a</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Link
                      href={sourceFocusHref(row.metricKey)}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                    >
                      聚焦
                    </Link>
                  </td>
                  <td className="py-3">
                    <span className="block text-slate-700">{row.degradedReason}</span>
                    {row.note !== row.degradedReason ? <span className="mt-1 block text-xs text-slate-500">{row.note}</span> : null}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-6 text-center text-sm text-slate-500">
                    当前筛选没有匹配来源。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </InfoCard>
    </Shell>
  );
}
