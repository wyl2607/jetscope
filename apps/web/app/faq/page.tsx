import { PageTemplate } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildPageMetadata({
  title: '常见问题',
  description: 'JetScope 上线前置状态、数据来源、研究信号、情景写入和受保护操作的常见问题说明。',
  path: '/faq',
  alternateLanguages: {
    'zh-CN': '/faq',
    en: '/en/faq',
    de: '/de/faq'
  }
});

const questions = [
  {
    title: 'JetScope 当前能做什么？',
    why: '先确认产品覆盖的决策范围，避免把它当成不受边界约束的通用分析工具。',
    body:
      'JetScope 把航油价格、SAF 成本拐点、欧盟储备压力、来源质量、情景假设和研究信号放在同一个复核流程里，帮助团队判断 SAF 何时从合规成本变成运营决策。',
    href: '/dashboard' as Route,
    action: '打开决策驾驶舱'
  },
  {
    title: '为什么上线前置状态可能显示 not ready？',
    why: '把配置缺口与产品故障分开，才能决定是补环境还是排查功能。',
    body:
      'not ready 不是页面失败，而是本地或部署环境还缺少必要配置，例如管理令牌、AI research 开关、数据库或来源覆盖状态。页面会披露阻塞项和复核项，不会假装已经上线就绪。',
    href: '/admin' as Route,
    action: '查看上线前置状态'
  },
  {
    title: '数据来源显示 degraded 或 fallback 怎么办？',
    why: '来源降级会改变数字的可用边界，引用前必须知道该复核什么。',
    body:
      'degraded/fallback 表示当前数据仍可读，但需要复核来源、置信度、延迟或代理链路。来源页面提供恢复步骤、筛选和处理入口。',
    href: '/sources' as Route,
    action: '查看数据来源'
  },
  {
    title: '研究信号为什么可能显示 disabled？',
    why: '未启用与没有市场变化不是一回事，错误解读会制造虚假的确定性。',
    body:
      '研究信号默认不会伪装成实时 AI 分析。未启用 AI research 或缺少凭证时，研究页面会显示边界、最近信号数量和后续动作。',
    href: '/research' as Route,
    action: '查看研究信号'
  },
  {
    title: '我能直接保存情景或刷新市场吗？',
    why: '受保护写操作需要明确权限，先确认入口能避免把只读状态误判为故障。',
    body:
      '创建、更新、删除情景以及刷新市场/研究管线都属于受保护写操作，需要管理员配置。没有权限时，UI 会保持只读并解释为什么锁定。',
    href: '/scenarios' as Route,
    action: '查看情景工作区'
  }
] as const;

export default function FaqPage() {
  return (
    <PageTemplate
      eyebrow="帮助 · 上线边界"
      title="常见问题"
      question="我看到的这个状态，是产品坏了还是本来就没开？"
      asOf={null}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {questions.map((item) => (
          <Panel key={item.title} title={item.title} why={item.why}>
            <p className="text-sm leading-7 text-muted">{item.body}</p>
            <p className="mt-4 text-sm">
              <Link className="font-semibold text-accent underline" href={item.href}>
                {item.action}
              </Link>
            </p>
          </Panel>
        ))}
      </div>

      <SourceFooter
        sources={[
          {
            id: 'ui-contract',
            label: 'docs/UI_CONTRACT.md（页面状态与交互行为契约）',
            basis: 'assumption'
          },
          {
            id: 'launch-readiness-contract',
            label: '上线前置检查与来源页当前口径',
            basis: 'assumption'
          }
        ]}
        methodHref="/sources"
        methodLabel="查看来源状态与口径"
        limitations={[
          '这些回答描述的是当前部署的设计意图，不随实时数据变化；具体环境是否就绪以上线前置状态为准。',
          'FAQ 不替代来源、研究或情景页面上的实时状态与适用边界。'
        ]}
      />
    </PageTemplate>
  );
}
