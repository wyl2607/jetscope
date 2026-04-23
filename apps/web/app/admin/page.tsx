import { AdminDataOps } from '@/components/admin-data-ops';
import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const adminTasks = [
  '手动编辑各路线成本区间与减排参数',
  '维护政策参数和时间表',
  '录入文献和来源备注',
  '标记数据质量 / 人工校验状态',
  '触发市场数据 refresh job'
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
      eyebrow="Admin console"
      title="Assumptions and policy admin"
      description="后台已接入 pathways/policies 的真实读写接口，并支持触发市场数据刷新。"
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <InfoCard title="Minimum admin surface" subtitle="Phase B first cut">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {adminTasks.map((task) => (
              <li key={task}>• {task}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Backoffice contract" subtitle="对应 FastAPI / PostgreSQL">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
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
