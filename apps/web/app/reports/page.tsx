import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '报告工作台',
  description: 'JetScope SAF 临界点分析的报告工作台，展示来源状态、情景数量与风险信号。',
  path: '/reports'
});

const reports: Array<{ title: string; description: string; href: Route; status: string }> = [
  {
    title: '临界点报告',
    description: '串联储备压力、燃料经济性、航司决策概率与研究信号的主报告。',
    href: '/reports/tipping-point-analysis' as Route,
    status: '已接入实时 read model'
  }
];

const actions: Array<{ label: string; href: Route; description: string }> = [
  {
    label: '打开临界点报告',
    href: '/reports/tipping-point-analysis' as Route,
    description: '阅读当前最完整的 SAF-vs-航油阈值叙事。'
  },
  {
    label: '复核来源',
    href: '/sources?filter=review' as Route,
    description: '检查回退、代理、降级和波动警报。'
  },
  {
    label: '查看驾驶舱',
    href: '/dashboard' as Route,
    description: '回到实时市场、情景与风险总览。'
  }
];

function formatPercent(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return '正常';
  if (status === 'degraded') return '降级';
  if (status === 'offline') return '离线';
  if (status === 'unknown') return '未知';
  return status;
}

// Section 1 rule 5: the tint states a fact about the data. A page that says
// "需复核" in the same colour as everything else has reported the problem
// without encoding it.
function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function freshnessLabel(level: string): string {
  if (level === 'fresh') return '新鲜';
  if (level === 'stale') return '偏旧';
  if (level === 'critical') return '严重过期';
  return level;
}

export default async function ReportsPage() {
  const readModel = await getDashboardReadModel();
  const sourceStatus = readModel.market.source_status;
  const topRiskSignal = readModel.topRiskSignal;
  const latestScenarioNames = readModel.recentScenarioNames.length
    ? readModel.recentScenarioNames.join(' / ')
    : '暂无已保存情景';
  const needsReview = readModel.isFallback || sourceStatus.overall !== 'ok';
  const readiness = needsReview ? '需复核' : '可发布候选';
  const readinessHint = readModel.isFallback
    ? `报告可渲染，但当前使用 fallback：${readModel.error ?? '未知原因'}`
    : sourceStatus.overall !== 'ok'
      ? `来源状态为${sourceStatusLabel(sourceStatus.overall)}，发布前先复核数据来源`
      : '所有报告入口可从当前 read model 复核';

  // The fallback read model stamps itself with the current time, so rendering
  // that as a data timestamp would present fabricated values as fresh. No stamp
  // is the honest answer here; the footer says why.
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      eyebrow="组合报告"
      title="报告工作台"
      question="这份报告现在能不能作为决策依据发出去？"
      asOf={asOf}
    >
      <SignalRow label="发布就绪信号">
        {/* Section 2 rule 2: the verdict leads. A reader who stops after the
            first card still leaves with the answer to the question above. */}
        <MetricCard
          label="上线姿态"
          value={readiness}
          valueClassName={needsReview ? 'text-warning' : 'text-success'}
          hint={readinessHint}
        />
        <MetricCard
          label="来源状态"
          value={sourceStatusLabel(sourceStatus.overall)}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={`置信度 ${formatPercent((sourceStatus.confidence ?? 0) * 100)} · 回退率 ${formatPercent(sourceStatus.fallback_rate)} · ${freshnessLabel(readModel.freshnessSignal.level)} ${readModel.freshnessSignal.minutes} 分钟`}
        />
        <MetricCard
          label="风险信号"
          value={topRiskSignal ? `${topRiskSignal.metric} ${topRiskSignal.window}` : '暂无异常'}
          hint={
            topRiskSignal
              ? `${topRiskSignal.level} · ${topRiskSignal.changePct > 0 ? '+' : ''}${topRiskSignal.changePct.toFixed(2)}%`
              : '市场历史窗口尚未形成可排序警报'
          }
          valueHref={
            topRiskSignal ? (`/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}` as Route) : undefined
          }
        />
        <MetricCard label="情景数量" value={`${readModel.scenarioCount}`} hint={latestScenarioNames} />
      </SignalRow>

      <Panel title="报告目录" why="每份报告的入口，以及它当前接的是实时数据还是静态叙事。">
        <div className="space-y-4">
          {reports.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{report.status}</p>
              <h3 className="mt-2 text-lg font-medium text-ink">{report.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="发布前动作" why="报告页的下一步不是猜测，而是复核——每个入口都指向可验证的证据。">
        <div className="space-y-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-medium text-ink">{action.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'dashboard-read-model',
            label: readModel.isFallback
              ? `市场快照接口无响应，当前为内置兜底值（${readModel.error ?? '未知原因'}）`
              : '市场快照接口（来源状态、置信度、回退率、新鲜度）',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
            // 情景本身就是一组假设。库里"有几个"是实测，但读者会拿情景里的数字去引用，
            // 标 observed 等于邀请他们把假设当测量值。两个页面必须给同一个来源同一个标签。
            label: `本地情景库（当前 ${readModel.scenarioCount} 个已保存情景）`,
            basis: 'assumption'
          },
          {
            id: 'risk-signal',
            label: '风险信号由市场历史窗口的变动幅度推导，非上游直接给出',
            basis: 'derived'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '“可发布候选”只表示数据链路可复核，不代表结论已被人工审阅。',
          '风险信号依赖历史窗口样本量，样本不足时不会产生警报，不等于没有风险。',
          '情景库是本地保存的假设，用于复盘和讨论，不替代真实采购审批。'
        ]}
      />
    </PageTemplate>
  );
}
