import { InfoCard } from '@/components/cards';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { Shell } from '@/components/shell';
import { buildApiUrl } from '@/lib/api-config';
import { getSourcesReadModel, type SourcesReadModel } from '@/lib/sources-read-model';
import type { Metadata, Route } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { FocusScroll } from './focus-scroll';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '来源 · Trust Center',
  description:
    '查看 JetScope 来源溯源、as-of、置信度、滞后、回退状态与 market refresh 健康度。',
  path: '/sources'
});

type MarketHealth = {
  healthy: boolean;
  refresh_interval_seconds: number;
  age_seconds: number | null;
  next_refresh_eta_seconds: number | null;
  runs_total: number;
  runs_ok: number;
  success_rate: number | null;
  latest_status: string | null;
  note: string;
  recent_runs: Array<{ refreshed_at: string; source_status: string; ingest: string; ok: boolean }>;
};

async function getMarketHealth(): Promise<MarketHealth | null> {
  try {
    const response = await fetch(buildApiUrl('/market/health?runs_window=10'), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as MarketHealth;
  } catch {
    return null;
  }
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

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
  const [readModel, marketHealth] = await Promise.all([getSourcesReadModel(), getMarketHealth()]);
  const visibleRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, activeFilter));
  const reviewRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, 'review'));
  const actionRows = reviewRows.filter((row) => row.reviewAction.priority !== 'normal').slice(0, 4);
  const hasActionRows = actionRows.length > 0;
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
    if (level === "alert") return "text-danger";
    if (level === "watch") return "text-warning";
    return "text-success";
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
    if (state === 'live') return 'border-success bg-success-soft text-success';
    if (state === 'proxy') return 'border-accent bg-accent-soft text-accent';
    if (state === 'fallback') return 'border-warning bg-warning-soft text-warning';
    return 'border-danger bg-danger-soft text-danger';
  };

  const trustLabel = (state: string) => {
    if (state === 'live') return '实时';
    if (state === 'proxy') return '代理';
    if (state === 'fallback') return '回退';
    if (state === 'degraded') return '降级';
    return state;
  };

  const actionToneClass = (priority: SourceRow['reviewAction']['priority']) => {
    if (priority === 'critical') return 'border-danger bg-danger-soft text-danger';
    if (priority === 'review') return 'border-warning bg-warning-soft text-warning';
    return 'border-line bg-surface-muted text-muted';
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
      <div className="mb-6">
        <InfoCard
          title="Market refresh health"
          subtitle={marketHealth ? (marketHealth.healthy ? 'refresh loop usable' : 'attention needed') : 'health API unavailable'}
        >
          {marketHealth ? (
            <div className="space-y-2 text-sm text-muted">
              <p>
                间隔 <strong>{marketHealth.refresh_interval_seconds}s</strong> · age{' '}
                <strong>{formatEta(marketHealth.age_seconds)}</strong> · next ETA{' '}
                <strong>{formatEta(marketHealth.next_refresh_eta_seconds)}</strong> · status{' '}
                <code>{marketHealth.latest_status ?? 'n/a'}</code>
              </p>
              <p>
                runs {marketHealth.runs_ok}/{marketHealth.runs_total}
                {marketHealth.success_rate != null
                  ? ` · success ${(marketHealth.success_rate * 100).toFixed(0)}%`
                  : ''}
              </p>
              <p className="text-xs text-subtle">{marketHealth.note}</p>
            </div>
          ) : (
            <p className="text-sm text-subtle">无法加载 /v1/market/health。请确认 API 已启动并有 refresh run。</p>
          )}
        </InfoCard>
      </div>
      <div className="mb-6">
        <InfoCard
          title="恢复步骤"
          subtitle={hasActionRows ? '把降级来源转成可执行处理清单' : '当前没有必须处理的降级来源'}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              需复核 {reviewRows.length}
            </span>
            <span className="rounded-md border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              优先处理 {actionRows.length}
            </span>
            <Link
              href={'/admin' as Route}
              className="rounded-md border border-accent bg-accent-soft px-3 py-1.5 font-semibold text-accent hover:bg-accent-hover"
            >
              打开 Admin 刷新
            </Link>
            <Link
              href={'/sources?filter=review' as Route}
              className="rounded-md border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
            >
              只看需复核
            </Link>
          </div>
          {hasActionRows ? (
            <ol className="mt-4 divide-y divide-line border-y border-line">
              {actionRows.map((row) => (
                <li key={row.metricKey} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(10rem,14rem)_1fr_auto] md:items-start">
                  <div>
                    <p className="font-semibold text-ink">{row.surface}</p>
                    <p className="mt-1 text-xs text-subtle">{row.source} · {statusLabel(row.status)}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}>
                      {row.reviewAction.label}
                    </span>
                    <p className="mt-2 leading-6 text-muted">{row.reviewAction.detail}</p>
                  </div>
                  <Link
                    href={row.reviewAction.href as Route}
                    className="rounded-md border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                  >
                    处理入口
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 border-y border-line py-3 text-sm leading-6 text-muted">
              当前来源没有回退或降级行；代理来源仍应在重大采购、定价、披露前做人工复核。
            </p>
          )}
        </InfoCard>
      </div>
      <InfoCard title="市场输入矩阵" subtitle={`总体状态：${readModel.overallStatus}`}>
        <p className="mb-3 text-xs text-muted">
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
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:bg-surface-muted'
                }`}
                title={filter.hint}
              >
                {filter.label} <span className="ml-1 text-subtle">{count}</span>
              </Link>
            );
          })}
          <span className="text-xs text-subtle">
            正在显示 {visibleRows.length} / {readModel.rows.length}
          </span>
        </div>
        {focusMetricKey ? (
          <p className="mb-3 text-xs text-accent">
            已从驾驶舱风险信号聚焦：<code>{focusMetricKey}</code>{' '}
            <Link href={clearFocusHref} className="underline text-accent">
              清除
            </Link>
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-muted">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-3 pr-4">界面</th>
                <th className="py-3 pr-4">来源</th>
                <th className="py-3 pr-4">可信状态</th>
                <th className="py-3 pr-4">范围</th>
                <th className="py-3 pr-4">置信度</th>
                <th className="py-3 pr-4">As of</th>
                <th className="py-3 pr-4">滞后</th>
                <th className="py-3 pr-4">状态</th>
                <th className="py-3 pr-4">Fallback</th>
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
                  className={`border-b border-line ${
                    focusMetricKey === row.metricKey
                      ? 'ring-1 ring-accent/60 bg-accent-soft'
                      : row.alertLevel === 'alert'
                      ? 'bg-danger-soft'
                      : row.alertLevel === 'watch'
                        ? 'bg-warning-soft'
                        : ''
                  }`}
                >
                  <td className="py-3 pr-4 font-medium text-ink">{row.surface}</td>
                  <td className="py-3 pr-4">{row.source}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] ${trustClass(row.trustState)}`}>
                      {trustLabel(row.trustState)}
                    </span>
                    <span className="mt-1 block text-xs text-subtle">{sourceTypeLabel(row.sourceType)}</span>
                  </td>
                  <td className="py-3 pr-4">{row.scope}</td>
                  <td className="py-3 pr-4">{row.confidence}</td>
                  <td className="py-3 pr-4 text-xs text-subtle">{row.asOf}</td>
                  <td className="py-3 pr-4">{row.lag}</td>
                  <td className="py-3 pr-4">{statusLabel(row.status)}</td>
                  <td className={`py-3 pr-4 font-medium ${row.fallback === 'yes' ? 'text-warning' : 'text-success'}`}>
                    {row.fallback}
                  </td>
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
                      <span className="text-subtle">n/a</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex min-w-24 flex-col gap-2">
                      <Link
                        href={sourceFocusHref(row.metricKey)}
                        className="rounded-md border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                      >
                        聚焦
                      </Link>
                      <Link
                        href={row.reviewAction.href as Route}
                        className="rounded-md border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-muted hover:border-accent hover:bg-accent-soft"
                      >
                        {row.reviewAction.priority === 'normal' ? '留证' : '处理'}
                      </Link>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="block text-muted">{row.degradedReason}</span>
                    {row.note !== row.degradedReason ? <span className="mt-1 block text-xs text-subtle">{row.note}</span> : null}
                    <span className="mt-2 block text-xs font-semibold text-muted">{row.reviewAction.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-subtle">{row.reviewAction.detail}</span>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-6 text-center text-sm text-subtle">
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
