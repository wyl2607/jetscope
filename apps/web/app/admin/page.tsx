import { AdminDataOps } from '@/components/admin-data-ops';
import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

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

export default function AdminPage() {
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
            <p>`route_catalog`：维护默认路线定义</p>
            <p>`policy_parameters`：维护政策/补贴/ mandate</p>
            <p>`market_snapshots`：保存定时任务抓取结果</p>
            <p>`scenarios`：版本化假设，支持对比与导出</p>
          </div>
        </InfoCard>
      </section>

      <AdminDataOps />
    </Shell>
  );
}
