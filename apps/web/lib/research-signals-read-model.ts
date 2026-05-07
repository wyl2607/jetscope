import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type ResearchSignal = {
  id: string;
  signal_type: string;
  title: string;
  impact_direction: 'positive' | 'negative' | 'neutral' | 'unknown';
  confidence: number;
  summary_cn: string;
  summary_en: string;
  published_at: string;
};

export type ResearchSignalsResult =
  | {
      status: 'ok';
      signals: ResearchSignal[];
    }
  | {
      status: 'not_found';
      signals: [];
    }
  | {
      status: 'error';
      signals: [];
      message: string;
    };

export type ResearchDecisionBrief = {
  status: ResearchSignalsResult['status'] | 'empty';
  headline: string;
  whyMatters: string;
  action: string;
  activeCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topSignals: ResearchSignal[];
};

export const AI_RESEARCH_ENABLED =
  String(process.env.JETSCOPE_AI_RESEARCH_ENABLED ?? process.env.AI_RESEARCH_ENABLED ?? '').toLowerCase() === 'true';

function researchFetchTimeoutMs(): number {
  const parsed = Number(process.env.JETSCOPE_PORTFOLIO_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 100) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function normalizeImpactDirection(value: unknown): ResearchSignal['impact_direction'] {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'positive' || normalized === 'negative' || normalized === 'neutral') {
    return normalized;
  }
  if (normalized === 'bullish_saf' || normalized === 'bullish') {
    return 'positive';
  }
  if (normalized === 'bearish_saf' || normalized === 'bearish') {
    return 'negative';
  }
  return 'unknown';
}

function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeSignal(raw: Record<string, unknown>, index: number): ResearchSignal {
  const signalType = String(raw.signal_type ?? raw.type ?? 'uncategorized');
  const title = String(raw.title ?? raw.raw_title ?? raw.headline ?? `${signalType} 信号 ${index + 1}`);

  return {
    id: String(raw.id ?? raw.signal_id ?? `${signalType}-${index}`),
    signal_type: signalType,
    title,
    impact_direction: normalizeImpactDirection(raw.impact_direction),
    confidence: clampConfidence(raw.confidence ?? raw.confidence_score),
    summary_cn: String(raw.summary_cn ?? raw.summary_zh ?? raw.summary ?? '暂无中文摘要。'),
    summary_en: String(raw.summary_en ?? raw.summary ?? '暂无英文摘要。'),
    published_at: String(raw.published_at ?? raw.created_at ?? raw.generated_at ?? new Date().toISOString())
  };
}

async function fetchJsonWithStatus<T>(path: string): Promise<{ status: number; data: T | null; error?: string }> {
  const controller = new AbortController();
  const timeoutMs = researchFetchTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildApiUrl(path), {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        status: response.status,
        data: null
      };
    }

    return {
      status: response.status,
      data: (await response.json()) as T
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        status: 408,
        data: null,
        error: `timeout after ${timeoutMs}ms`
      };
    }

    if (error instanceof SyntaxError) {
      return {
        status: 502,
        data: null,
        error: '无效 JSON 响应'
      };
    }

    return {
      status: 502,
      data: null,
      error: error instanceof Error ? error.message : '组合数据拉取失败'
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getResearchSignals(): Promise<ResearchSignalsResult> {
  if (!AI_RESEARCH_ENABLED) {
    return {
      status: 'ok',
      signals: []
    };
  }

  try {
    const search = new URLSearchParams({
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      limit: '20'
    });
    const response = await fetchJsonWithStatus<unknown>(`/research/signals?${search.toString()}`);
    if (response.status === 404) {
      return {
        status: 'not_found',
        signals: []
      };
    }

    if (response.status >= 400 || response.data == null) {
      return {
        status: 'error',
        signals: [],
        message: response.error ? `HTTP ${response.status}: ${response.error}` : `HTTP ${response.status}`
      };
    }

    const rawSignals = Array.isArray(response.data)
      ? response.data
      : Array.isArray((response.data as { signals?: unknown[] }).signals)
        ? (response.data as { signals: unknown[] }).signals
        : [];

    const signals = rawSignals
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item, index) => normalizeSignal(item, index));

    return {
      status: 'ok',
      signals
    };
  } catch (error) {
    return {
      status: 'error',
      signals: [],
      message: error instanceof Error ? error.message : '研究信号加载失败'
    };
  }
}

export function buildResearchDecisionBrief(result: ResearchSignalsResult): ResearchDecisionBrief {
  if (result.status === 'error') {
    return {
      status: 'error',
      headline: '研究信息流已降级',
      whyMatters: `AI 研究层当前不可用：${result.message}`,
      action: '继续展示市场与储备模型，但在信息流恢复前不要用研究信号解释概率变化。',
      activeCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      topSignals: []
    };
  }

  if (result.status === 'not_found') {
    return {
      status: 'not_found',
      headline: '研究 API 尚未部署',
      whyMatters: '组合页面可以在没有 Phase B 的情况下渲染，但暂时无法为 SAF 交叉变化附加文章级证据。',
      action: '在危机页或报告叙事中使用 AI 信号前，请先部署研究 API。',
      activeCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      topSignals: []
    };
  }

  const topSignals = [...result.signals]
    .sort((left, right) => right.confidence - left.confidence || Date.parse(right.published_at) - Date.parse(left.published_at))
    .slice(0, 3);
  const positiveCount = result.signals.filter((signal) => signal.impact_direction === 'positive').length;
  const negativeCount = result.signals.filter((signal) => signal.impact_direction === 'negative').length;
  const neutralCount = result.signals.filter((signal) => signal.impact_direction === 'neutral').length;

  if (result.signals.length === 0) {
    return {
      status: 'empty',
      headline: AI_RESEARCH_ENABLED ? '暂无活跃研究信号' : '研究流水线已关闭',
      whyMatters: AI_RESEARCH_ENABLED
        ? '每日研究任务在当前回看窗口内尚未持久化信号。'
        : '研究信号层未在当前环境启用，所以这里不会影响储备或 SAF 模型判断。',
      action: AI_RESEARCH_ENABLED
        ? '依赖文章派生解释前，请运行或检查研究摄取任务。'
        : '继续使用市场、储备和情景模型；需要文章证据时再开启研究任务。',
      activeCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      topSignals: []
    };
  }

  const leadingSignal = topSignals[0];
  const headline = negativeCount > positiveCount
    ? '研究信号显示 SAF 采用面临阻力'
    : positiveCount > negativeCount
      ? '研究信号支持 SAF 采用压力上升'
      : '研究信号分化';
  const whyMatters = leadingSignal
    ? `${leadingSignal.title}：${leadingSignal.summary_cn || leadingSignal.summary_en}`
    : '已有信号，但暂无摘要。';

  return {
    status: 'ok',
    headline,
    whyMatters,
    action: '用这些信号解释自上次评审以来 SAF 切换概率、储备压力或采购时点为何变化。',
    activeCount: result.signals.length,
    positiveCount,
    negativeCount,
    neutralCount,
    topSignals
  };
}
