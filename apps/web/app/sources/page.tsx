import { InfoCard } from '@/components/cards';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { Shell } from '@/components/shell';
import { getSourcesReadModel } from '@/lib/sources-read-model';
import type { Metadata } from 'next';
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

export default async function SourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const focusMetricKey = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const readModel = await getSourcesReadModel();

  const alertLabel = (level: "normal" | "watch" | "alert") => {
    if (level === "alert") return "警报";
    if (level === "watch") return "观察";
    return "正常";
  };

  const alertColor = (level: "normal" | "watch" | "alert") => {
    if (level === "alert") return "text-rose-300";
    if (level === "watch") return "text-amber-300";
    return "text-emerald-300";
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
    if (state === 'live') return 'border-emerald-600/40 bg-emerald-500/10 text-emerald-200';
    if (state === 'proxy') return 'border-sky-600/40 bg-sky-500/10 text-sky-200';
    if (state === 'fallback') return 'border-amber-600/40 bg-amber-500/10 text-amber-200';
    return 'border-rose-600/40 bg-rose-500/10 text-rose-200';
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
        <p className="mb-3 text-xs text-slate-400">
          生成于 {new Date(readModel.generatedAt).toLocaleString()}
          {readModel.isFallback ? ' · 实时来源覆盖不可用时显示回退估算' : ''}
        </p>
        {focusMetricKey ? (
          <p className="mb-3 text-xs text-sky-300">
            已从驾驶舱风险信号聚焦：<code>{focusMetricKey}</code>{' '}
            <Link href="/sources" className="underline text-sky-200">
              清除
            </Link>
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
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
                <th className="py-3">可信原因 / 降级原因</th>
              </tr>
            </thead>
            <tbody>
              {readModel.rows.map((row) => (
                <tr
                  key={row.surface}
                  id={`metric-${row.metricKey}`}
                  className={`border-b border-slate-900 ${
                    focusMetricKey === row.metricKey
                      ? 'ring-1 ring-sky-400/60 bg-sky-950/30'
                      : row.alertLevel === 'alert'
                      ? 'bg-rose-950/25'
                      : row.alertLevel === 'watch'
                        ? 'bg-amber-950/20'
                        : ''
                  }`}
                >
                  <td className="py-3 pr-4 font-medium text-white">{row.surface}</td>
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
                  <td className="py-3">
                    <span className="block text-slate-300">{row.degradedReason}</span>
                    {row.note !== row.degradedReason ? <span className="mt-1 block text-xs text-slate-500">{row.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoCard>
    </Shell>
  );
}
