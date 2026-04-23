import { InfoCard } from '@/components/cards';
import { ScenarioRegistry } from '@/components/scenario-registry';
import { Shell } from '@/components/shell';
import { TransitionReadinessDashboard } from '@/components/transition-readiness-dashboard';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const cards = [
  {
    title: 'Scenario registry',
    body: '列出所有情景、状态、创建人、更新时间，以及是否为研究快照。'
  },
  {
    title: 'Scenario compare',
    body: '并排比较当前工作态、保存情景、以及默认政策路径。'
  },
  {
    title: 'Sensitivity sweeps',
    body: '下一步将在这里放 crude / carbon / subsidy sweep 结果。'
  }
];

export const metadata: Metadata = buildPageMetadata({
  title: 'Scenarios',
  description:
    'Manage SAF transition scenarios, compare policy pathways, and monitor readiness signals with persistent registry-backed workflows.',
  path: '/scenarios'
});

export default function ScenariosPage() {
  return (
    <Shell
      eyebrow="Scenario workspace"
      title="Scenario management & transition monitor"
      description="第二页面承接综合研究仪表盘，并已接入真实 scenario registry（FastAPI + PostgreSQL）用于创建、更新、删除与回填。"
    >
      <TransitionReadinessDashboard />
      <ScenarioRegistry />

      <section className="mt-8 grid gap-5 md:grid-cols-3">
        {cards.map((card) => (
          <InfoCard key={card.title} title={card.title}>
            <p className="text-sm leading-7 text-slate-300">{card.body}</p>
          </InfoCard>
        ))}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="Why this lives on page two" subtitle="开发分层">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>1. 首页继续承担“当前成本比较 + break-even calculator”的即时判断任务。</p>
            <p>2. 第二页面聚焦“行业转型追踪”：国家、航司、路线、政策四个维度一屏联读。</p>
            <p>3. 等 FastAPI / DB 真实 scenario 能力落地后，再把保存情景、对比、sweep 结果接进这一页的下半区。</p>
          </div>
        </InfoCard>

        <InfoCard title="Next product hooks" subtitle="后续接真实数据的接口位">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            <li>• 国家政策推进：接 `/v1/policies/refuel-eu` 与地区政策 catalog。</li>
            <li>• 航司采用率：接研究数据库或人工维护的 airline adoption registry。</li>
            <li>• 路线就绪度：复用首页的 route math / scenario engine 统一输出。</li>
            <li>• 时间轴：后台可编辑，支持标记已生效 / 延迟 / 草案。</li>
          </ul>
        </InfoCard>
      </section>
    </Shell>
  );
}
