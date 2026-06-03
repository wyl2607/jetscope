import { AdminDataOps } from '@/components/admin-data-ops';
import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { getLaunchReadinessReadModel, type LaunchReadinessCheck } from '@/lib/readiness-read-model';
import Link from 'next/link';
import type { Route } from 'next';

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

function readinessToneClass(tone: LaunchReadinessCheck['tone']): string {
  if (tone === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (tone === 'review') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export default async function AdminPage() {
  const readiness = await getLaunchReadinessReadModel();

  return (
    <Shell
      eyebrow="管理台"
      title="假设与数据接入管理"
      description="后台已接入 pathways/policies 的真实读写接口，并显示市场刷新写入本地数据库后的读回证据。"
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <InfoCard title="当前可操作范围" subtitle="真实 API 写入，不是占位文本">
          <ul className="space-y-3 text-sm leading-7 text-slate-700">
            {adminTasks.map((task) => (
              <li key={task}>• {task}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="后端数据合同" subtitle="FastAPI / 本地 SQLite 或 PostgreSQL">
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">route_catalog</code>：维护默认路线定义</p>
            <p><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">policy_parameters</code>：维护政策、补贴与 mandate 参数</p>
            <p><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">market_snapshots</code>：保存定时任务抓取结果</p>
            <p><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">scenarios</code>：版本化假设，支持对比与导出</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-5">
        <InfoCard title="上线前置状态" subtitle={`API readiness：${readiness.statusLabel}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-md border px-3 py-1.5 font-semibold ${readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {readiness.ready ? 'Ready' : 'Not ready'}
            </span>
            {readiness.degraded ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                Degraded
              </span>
            ) : null}
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              {readiness.environment} · {readiness.apiPrefix} · schema {readiness.schemaBootstrapMode}
            </span>
          </div>
          {readiness.error ? (
            <p className="mt-4 border-y border-rose-200 py-3 text-sm leading-6 text-rose-700">
              Readiness API 暂不可用：{readiness.error}
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {readiness.checks.map((check) => (
                <div key={check.key} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(9rem,12rem)_minmax(9rem,10rem)_1fr_auto] md:items-start">
                  <p className="font-semibold text-slate-950">{check.label}</p>
                  <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check.tone)}`}>
                    {check.statusLabel}
                  </span>
                  <p className="leading-6 text-slate-700">{check.detail}</p>
                  <Link
                    href={check.actionHref as Route}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                  >
                    {check.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      </section>

      <AdminDataOps />
    </Shell>
  );
}
