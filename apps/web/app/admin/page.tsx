import { AdminDataOps } from '@/components/admin-data-ops';
import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getLaunchReadinessReadModel, type LaunchReadinessCheck } from '@/lib/readiness-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

const adminTasks = [
  '手动编辑各路线成本区间与减排参数',
  '维护政策参数和时间表',
  '触发市场数据刷新并读回快照',
  '查看写入本地数据库的刷新证据',
  '确认前端读取的是 API 返回的最新状态'
];

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin',
  description:
    'Operate JetScope policy assumptions, pathway parameters, and market refresh controls through the backoffice admin console.',
  path: '/admin'
});

function readinessToneClass(check: LaunchReadinessCheck): string {
  if (check.tone === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (check.tone === 'review') return 'border-warning bg-warning-soft text-warning';
  if (check.tone === 'ok' && check.status === 'ok') return 'border-success bg-success-soft text-success';
  if (check.tone === 'ok') return 'border-warning bg-warning-soft text-warning';
  return 'border-warning bg-warning-soft text-warning';
}

function launchImpactLabel(check: LaunchReadinessCheck): string {
  if (check.blocking) return '阻塞上线';
  if (check.severity === 'review') return '需复核';
  if (check.severity === 'ok') return '可用';
  return '未识别的状态';
}

function launchImpactClass(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'border-danger bg-danger-soft text-danger';
  if (check.severity === 'ok') return 'border-success bg-success-soft text-success';
  return 'border-warning bg-warning-soft text-warning';
}

function readinessValueTone(readiness: Awaited<ReturnType<typeof getLaunchReadinessReadModel>>): string {
  if (readiness.error || !readiness.ready) return 'text-danger';
  if (readiness.status === 'ready' && !readiness.degraded) return 'text-success';
  return 'text-warning';
}

export default async function AdminPage() {
  const readiness = await getLaunchReadinessReadModel();
  const asOf = readiness.error ? null : readiness.generatedAt;
  const blockingCount = readiness.checks.filter((check) => check.blocking).length;
  const reviewCount = readiness.checks.filter((check) => check.severity === 'review').length;

  return (
    <PageTemplate
      eyebrow="管理台"
      title="假设与数据接入管理"
      question="这套后台现在能不能安全地写入和上线？"
      asOf={asOf}
    >
      <SignalRow label="上线结论信号">
        <MetricCard
          label="能否上线"
          value={readiness.statusLabel}
          valueClassName={readinessValueTone(readiness)}
          hint={readiness.error ? `Readiness API 暂不可用：${readiness.error}` : readiness.ready ? '当前没有阻塞上线的前置项。' : '先处理阻塞项，再执行写入或上线。'}
        />
        <MetricCard
          label="阻塞项"
          value={`${blockingCount}`}
          valueClassName={blockingCount > 0 ? 'text-danger' : 'text-success'}
          hint="任何一项都会阻止安全上线。"
        />
        <MetricCard
          label="需复核项"
          value={`${reviewCount}`}
          valueClassName={reviewCount > 0 ? 'text-warning' : 'text-success'}
          hint="不一定阻塞，但上线前需要确认适用边界。"
        />
        <MetricCard
          label="环境上下文"
          value={`${readiness.environment} · ${readiness.apiPrefix}`}
          hint={`schema ${readiness.schemaBootstrapMode}；结论只适用于这个部署环境。`}
        />
      </SignalRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="当前可操作范围" why="明确哪些动作会写入真实 API，避免把管理台误当成演示界面。">
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {adminTasks.map((task) => (
              <li key={task}>• {task}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="后端数据合同" why="这些表决定写入落在哪里，以及刷新结果能否被后续页面读回。">
          <div className="space-y-3 text-sm leading-7 text-muted">
            <p><code className="rounded-xl bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted">route_catalog</code>：维护默认路线定义</p>
            <p><code className="rounded-xl bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted">policy_parameters</code>：维护政策、补贴与 mandate 参数</p>
            <p><code className="rounded-xl bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted">market_snapshots</code>：保存定时任务抓取结果</p>
            <p><code className="rounded-xl bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted">scenarios</code>：版本化假设，支持对比与导出</p>
          </div>
        </Panel>
      </div>

      <Panel title="上线前置状态" why="逐项定位阻塞、复核和健康状态，决定当前环境还缺哪一步。">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-xl border px-3 py-1.5 font-semibold ${readiness.error || !readiness.ready ? 'border-danger bg-danger-soft text-danger' : readiness.status === 'ready' && !readiness.degraded ? 'border-success bg-success-soft text-success' : 'border-warning bg-warning-soft text-warning'}`}>
            {readiness.ready ? 'Ready' : 'Not ready'}
          </span>
          {readiness.degraded ? (
            <span className="rounded-xl border border-warning bg-warning-soft px-3 py-1.5 font-semibold text-warning">
              Degraded
            </span>
          ) : null}
          <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
            {readiness.environment} · {readiness.apiPrefix} · schema {readiness.schemaBootstrapMode}
          </span>
        </div>
        {readiness.error ? (
          <p className="mt-4 rounded-xl border border-danger bg-danger-soft p-3 text-sm leading-6 text-danger">
            Readiness API 暂不可用：{readiness.error}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line border-y border-line">
            {readiness.checks.map((check) => (
              <div key={check.key} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(9rem,12rem)_minmax(9rem,10rem)_1fr_auto] md:items-start">
                <p className="font-semibold text-ink">{check.label}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check)}`}>
                    {check.statusLabel}
                  </span>
                  <span className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${launchImpactClass(check)}`}>
                    {launchImpactLabel(check)}
                  </span>
                </div>
                <div className="space-y-2 leading-6 text-muted">
                  <p>{check.detail}</p>
                  {check.configKeys.length ? (
                    <p className="text-xs text-muted">
                      相关配置：
                      {check.configKeys.map((key) => (
                        <code key={key} className="ml-1 rounded-xl bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted">
                          {key}
                        </code>
                      ))}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={check.actionHref as Route}
                  className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                >
                  {check.actionLabel}
                </Link>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="数据与假设写入工作区" why="只有在前置状态允许时，才在这里修改参数、刷新数据并核对写入证据。">
        <AdminDataOps />
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'launch-readiness-api',
            label: readiness.error ? 'Readiness API 当前不可用' : 'Readiness API 服务端检查结果',
            asOf,
            basis: readiness.error ? 'assumption' : 'derived'
          },
          {
            id: 'backend-data-contract',
            label: '后端数据合同表：route_catalog / policy_parameters / market_snapshots / scenarios',
            basis: 'assumption'
          }
        ]}
        methodHref="/sources"
        methodLabel="查看来源与数据口径"
        limitations={[
          '本页反映当前部署环境的就绪状态，不代表 JetScope 的产品能力上限。',
          '就绪检查是服务端根据当前配置和数据合同推导的结果；受保护写入仍需有效管理令牌。'
        ]}
      />
    </PageTemplate>
  );
}
