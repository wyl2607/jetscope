import { MetricCard } from '@/components/cards';
import { localeCopy, PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { SourceFooter } from '@/components/source-footer';
import { AI_RESEARCH_ENABLED, buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '研究工作台',
  description: 'AI 辅助的 SAF 与航油研究信号工作台，附带启用状态、置信度与复核动作。',
  path: '/research'
});

const actionLinks: Array<{ label: string; href: Route; description: string }> = [
  {
    label: '打开临界点报告',
    href: '/reports/tipping-point-analysis' as Route,
    description: '把研究信号放回储备、航油价格和 SAF 切换概率的报告语境。'
  },
  {
    label: '复核来源',
    href: '/sources?filter=review' as Route,
    description: '先确认市场来源、代理和回退状态，再使用研究信号解释变化。'
  }
];

type PipelineState = 'disabled' | 'waiting' | 'not_found' | 'error' | 'ready';

function getPipelineState(enabled: boolean, status: string, signalCount: number): PipelineState {
  if (!enabled) return 'disabled';
  if (status === 'error') return 'error';
  if (status === 'not_found') return 'not_found';
  if (signalCount === 0) return 'waiting';
  return 'ready';
}

function pipelineStateLabel(state: PipelineState): string {
  if (state === 'disabled') return '未启用';
  if (state === 'waiting') return '等待信号';
  if (state === 'not_found') return '未部署';
  if (state === 'error') return '错误';
  return '运行中';
}

function pipelineStateTone(state: PipelineState): string {
  if (state === 'disabled') return 'border-accent bg-accent-soft text-accent';
  if (state === 'waiting') return 'border-warning bg-warning-soft text-warning';
  if (state === 'not_found') return 'border-warning border-dashed bg-warning-soft text-warning';
  if (state === 'error') return 'border-danger bg-danger-soft text-danger';
  return 'border-success bg-success-soft text-success';
}

function pipelineValueTone(state: PipelineState): string {
  if (state === 'disabled') return 'text-accent';
  if (state === 'waiting' || state === 'not_found') return 'text-warning';
  if (state === 'error') return 'text-danger';
  return 'text-success';
}

function pipelineStateDetail(state: PipelineState, message: string | null): string {
  if (state === 'disabled') {
    return '开启研究流水线前，本页只提供产品工作台，不声称正在运行实时 AI 分析。';
  }
  if (state === 'waiting') {
    return '研究 API 已启用，但当前没有持久化信号；等待每日研究任务产出可复核记录。';
  }
  if (state === 'not_found') {
    return '研究服务尚未部署或当前环境找不到它；不要把空结果解释成没有市场变化。';
  }
  if (state === 'error') return `Research API 错误：${message ?? '未知原因'}。恢复前不要引用研究结论。`;
  return '研究 API 已启用，页面展示最近 30 天内持久化的研究信号。';
}

function toneForImpact(impact: string): string {
  if (impact === 'positive') return 'border-success bg-success-soft text-success';
  if (impact === 'negative') return 'border-danger bg-danger-soft text-danger';
  if (impact === 'neutral') return 'border-line bg-surface text-muted';
  return 'border-warning bg-warning-soft text-warning';
}

function impactLabel(impact: string): string {
  if (impact === 'positive') return '正向';
  if (impact === 'negative') return '负向';
  if (impact === 'neutral') return '中性';
  return '未知';
}

function formatTime(value: string | null): string {
  if (value == null) return localeCopy('zh').noData;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
}

export default async function ResearchPage() {
  const result = await getResearchSignals();
  const brief = buildResearchDecisionBrief(result);
  const latestSignal = result.signals.reduce<typeof result.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    const signalTime = signal.published_at == null ? Number.NEGATIVE_INFINITY : new Date(signal.published_at).getTime();
    const latestTime = latest.published_at == null ? Number.NEGATIVE_INFINITY : new Date(latest.published_at).getTime();
    return signalTime > latestTime ? signal : latest;
  }, null);
  const state = getPipelineState(AI_RESEARCH_ENABLED, result.status, result.signals.length);
  const resultMessage = result.status === 'error' ? result.message : null;
  const asOf = state === 'ready' ? latestSignal?.published_at ?? null : null;

  return (
    <PageTemplate
      eyebrow="AI 研究流水线"
      title="研究工作台"
      question="今天的研究信号，够不够解释市场为什么在动？"
      asOf={asOf}
    >
      <SignalRow label="研究结论信号">
        <MetricCard
          label="流水线状态"
          value={pipelineStateLabel(state)}
          valueClassName={pipelineValueTone(state)}
          hint={pipelineStateDetail(state, resultMessage)}
        />
        <MetricCard
          label="信号总数"
          value={`${result.signals.length}`}
          hint={`正向 ${brief.positiveCount} · 负向 ${brief.negativeCount} · 中性 ${brief.neutralCount}`}
        />
        <MetricCard
          label="最新信号"
          value={latestSignal ? formatTime(latestSignal.published_at) : '暂无'}
          hint={latestSignal ? latestSignal.title : '还没有可用于报告叙事的研究记录'}
        />
        <MetricCard
          label="使用边界"
          value={AI_RESEARCH_ENABLED ? '可解释' : '只读空态'}
          hint="研究信号只解释变化原因，不替代市场、储备或来源复核。"
        />
      </SignalRow>

      <Panel
        title="研究流水线状态"
        why="先区分配置边界、等待、未部署和故障，再决定是否引用研究结论。"
      >
        <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
          <p className="font-semibold">{pipelineStateLabel(state)}</p>
          <p className="mt-1">{pipelineStateDetail(state, resultMessage)}</p>
        </div>
      </Panel>

      <Panel
        title="研究决策层"
        why="把下面这串信号压成一句可以拿去做决定的话，以及它现在有多可信。"
      >
        <ResearchDecisionBriefCard brief={brief} showLink={false} />
      </Panel>

      <Panel title="信号列表" why="逐条查看研究结论、影响方向和置信度，避免只引用汇总判断。">
        {state !== 'ready' ? (
          <div className={`rounded-xl border p-4 text-sm leading-7 ${pipelineStateTone(state)}`}>
            {pipelineStateDetail(state, resultMessage)}
          </div>
        ) : (
          <div className="space-y-4">
            {result.signals.map((signal) => (
              <article key={signal.id} className="rounded-xl border border-line bg-surface-muted p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-xl border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneForImpact(signal.impact_direction)}`}>
                    {impactLabel(signal.impact_direction)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">{signal.signal_type}</span>
                  <span className="text-xs tabular-nums text-muted">{formatTime(signal.published_at)}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">{signal.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{signal.summary_cn}</p>
                <p className="mt-3 text-sm leading-7 text-muted">{signal.summary_en}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">
                  置信度 <span className="tabular-nums">{(signal.confidence * 100).toFixed(0)}%</span>
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="使用动作" why="研究信号必须回到证据链，读者应能从这里进入报告和来源复核。">
        <div className="space-y-3">
          {actionLinks.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-semibold text-ink">{action.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'research-signals',
            label: state === 'error' ? '研究信号 API 当前不可用' : '研究信号 read model（文章级信号、影响方向、置信度）',
            asOf,
            basis: 'derived'
          },
          {
            id: 'research-pipeline-config',
            label: '研究流水线启用配置与部署状态',
            basis: 'assumption'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '研究信号解释可能的变化原因，不替代市场、储备、情景或来源复核。',
          '未启用、等待、未部署和错误都不产生可引用的 as-of 时间；只有最新信号的 published_at 才作为页面时间。',
          '研究 API 出错或没有信号时，空结果不等于市场没有变化。'
        ]}
      />
    </PageTemplate>
  );
}
