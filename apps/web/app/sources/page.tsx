import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { SourceFooter } from '@/components/source-footer';
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

  const asOf = readModel.isFallback ? null : readModel.generatedAt;
  const needsReview = reviewRows.length;
  const reviewTone = needsReview > 0
    ? readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
      ? 'text-danger'
      : 'text-warning'
    : 'text-success';
  const trustTone = readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
    ? 'text-danger'
    : readModel.summary.proxyCount > 0
      ? 'text-warning'
      : 'text-success';
  const trustPosture = readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
    ? '需核验降级输入'
    : readModel.summary.proxyCount > 0
      ? '含代理来源'
      : '实时来源就绪';

  return (
    <PageTemplate
      eyebrow="来源目录"
      title="来源与溯源视图"
      question="这一屏的市场输入，现在有哪些还不能直接拿去做决策？"
      asOf={asOf}
    >
      <FocusScroll focusMetricKey={focusMetricKey} />
      <SignalRow label="来源可信信号">
        <MetricCard
          label="需复核"
          value={`${needsReview}`}
          valueClassName={`${reviewTone} tabular-nums`}
          hint={needsReview > 0 ? `${readModel.summary.fallbackCount} 个回退、${readModel.summary.degradedCount} 个降级，或存在代理/波动警报。` : '当前来源行没有需要额外复核的信号。'}
        />
        <MetricCard
          label="信任姿态"
          value={trustPosture}
          valueClassName={trustTone}
          hint={readModel.summary.trustLabel}
        />
        <MetricCard
          label="平均置信度"
          value={`${Math.round(readModel.summary.averageConfidence * 100)}%`}
          valueClassName={`${trustTone} tabular-nums`}
          hint={`完整度 ${readModel.completeness.value == null ? '—' : `${Math.round(readModel.completeness.value)}%`} · ${readModel.summary.freshnessLabel}`}
        />
        <MetricCard
          label="输入构成"
          value={`${readModel.summary.liveCount} 个实时`}
          valueClassName="tabular-nums"
          hint={`代理 ${readModel.summary.proxyCount} · 回退 ${readModel.summary.fallbackCount} · 降级 ${readModel.summary.degradedCount}`}
        />
      </SignalRow>

      <Panel
        title="来源溯源"
        why="当前市场快照里有多少是实测、多少是代理、多少是回退——这决定下面每一行能不能直接引用。"
      >
        <ProvenanceSummary
          summary={readModel.summary}
          completeness={readModel.completeness}
          generatedAt={readModel.isFallback ? null : readModel.generatedAt}
        />
      </Panel>

      <Panel
        title="来源覆盖"
        why="覆盖状态说明哪些 canonical metric 有可追溯的输入，避免把缺口误读成完整市场视图。"
      >
        <SourceCoveragePanel
          metrics={readModel.coverageMetrics}
          completeness={readModel.completeness}
          degraded={readModel.degraded}
        />
      </Panel>

      <Panel
        title="Market refresh health"
        why="刷新循环的健康度决定来源表是近期快照，还是可能已经脱离预期更新节奏。"
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
            <p className="rounded-xl border border-warning bg-warning-soft p-4 text-sm text-warning">无法加载 /v1/market/health。请确认 API 已启动并有 refresh run。</p>
          )}
      </Panel>

      <Panel
        title="恢复步骤"
        why="把需要复核的来源变成可执行入口，避免数据质量问题停留在状态标签里。"
      >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              需复核 {reviewRows.length}
            </span>
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              优先处理 {actionRows.length}
            </span>
            <Link
              href={'/admin' as Route}
              className="rounded-xl border border-accent bg-accent-soft px-3 py-1.5 font-semibold text-accent hover:bg-accent-hover"
            >
              打开 Admin 刷新
            </Link>
            <Link
              href={'/sources?filter=review' as Route}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
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
                    <span className={`inline-flex rounded-xl border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}>
                      {row.reviewAction.label}
                    </span>
                    <p className="mt-2 leading-6 text-muted">{row.reviewAction.detail}</p>
                  </div>
                  <Link
                    href={row.reviewAction.href as Route}
                    className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
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
      </Panel>

      <Panel
        title="市场输入矩阵"
        why="逐行展示来源、时间、滞后、数值和处理入口，支持在引用市场输入前完成复核。"
      >
        <p className="mb-3 text-xs text-muted">
           {asOf ? `生成于 ${new Date(asOf).toLocaleString()}` : '生成时间不可作为数据时间'}
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
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
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
           <table className="min-w-full text-left text-sm tabular-nums text-muted">
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
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] ${trustClass(row.trustState)}`}>
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
                        className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                      >
                        聚焦
                      </Link>
                      <Link
                        href={row.reviewAction.href as Route}
                        className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-muted hover:border-accent hover:bg-accent-soft"
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
      </Panel>

      <SourceFooter
        locale="zh"
        sources={[
          {
            id: 'sources-read-model',
            label: readModel.isFallback
              ? `来源读模型不可用，当前为回退估算（${readModel.error ?? '未知原因'}）`
              : '来源读模型（覆盖、置信度、滞后、回退与复核状态）',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'market-health-api',
            label: marketHealth ? 'Market refresh health API' : 'Market refresh health API 当前不可用',
            basis: marketHealth ? 'observed' : 'assumption'
          }
        ]}
        methodHref="/sources"
        methodLabel="来源覆盖与复核方法"
        limitations={[
          '来源状态说明输入质量，不证明单个市场数字适用于所有机场、合同或交易场景。',
          '代理、派生、回退和降级行在重大采购、定价或披露前都需要人工复核。',
          '回退读模型的生成时间是抓取失败后的本地时间，因此本页不会把它显示为数据时间。'
        ]}
      />
    </PageTemplate>
  );
}
