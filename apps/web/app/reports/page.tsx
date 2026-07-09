import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
  const readiness = readModel.isFallback || sourceStatus.overall !== 'ok' ? '需复核' : '可发布候选';
  const readinessHint = readModel.isFallback
    ? `报告可渲染，但当前使用 fallback：${readModel.error ?? '未知原因'}`
    : sourceStatus.overall !== 'ok'
      ? `来源状态为${sourceStatusLabel(sourceStatus.overall)}，发布前先复核数据来源`
      : '所有报告入口可从当前 read model 复核';

  return (
    <Shell
      eyebrow="组合报告"
      title="报告工作台"
      description="把驾驶舱数据、来源健康度和报告入口放在同一张上线评审清单里。"
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="来源状态"
          value={sourceStatusLabel(sourceStatus.overall)}
          hint={`置信度 ${formatPercent((sourceStatus.confidence ?? 0) * 100)} · 回退率 ${formatPercent(sourceStatus.fallback_rate)} · ${freshnessLabel(readModel.freshnessSignal.level)} ${readModel.freshnessSignal.minutes} 分钟`}
        />
        <MetricCard
          label="情景数量"
          value={`${readModel.scenarioCount}`}
          hint={latestScenarioNames}
        />
        <MetricCard
          label="风险信号"
          value={topRiskSignal ? `${topRiskSignal.metric} ${topRiskSignal.window}` : '暂无异常'}
          hint={
            topRiskSignal
              ? `${topRiskSignal.level} · ${topRiskSignal.changePct > 0 ? '+' : ''}${topRiskSignal.changePct.toFixed(2)}%`
              : '市场历史窗口尚未形成可排序警报'
          }
          valueHref={topRiskSignal ? (`/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}` as Route) : undefined}
        />
        <MetricCard
          label="上线姿态"
          value={readiness}
          hint={readinessHint}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard title="报告目录" subtitle="可复核、可点击、可继续扩展">
          <div className="space-y-4">
            {reports.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="block rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">{report.status}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">{report.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-700">{report.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>

        <InfoCard title="发布前动作" subtitle="报告页的下一步不是猜测，而是复核">
          <div className="space-y-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="font-semibold text-slate-950">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>
      </section>
    </Shell>
  );
}
