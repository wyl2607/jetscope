import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

type ReadinessCheck = {
  ok: boolean;
  status: string;
  detail?: string | null;
};

type ReadinessResponse = {
  ready: boolean;
  status: string;
  generated_at: string;
  service?: string;
  environment?: string;
  api_prefix?: string;
  schema_bootstrap_mode?: string;
  degraded?: boolean;
  checks?: Record<string, ReadinessCheck>;
};

export type LaunchReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  status: string;
  statusLabel: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
  tone: 'ok' | 'review' | 'critical';
};

export type LaunchReadinessReadModel = {
  generatedAt: string;
  status: string;
  statusLabel: string;
  ready: boolean;
  degraded: boolean;
  environment: string;
  apiPrefix: string;
  schemaBootstrapMode: string;
  checks: LaunchReadinessCheck[];
  error: string | null;
};

const CHECK_ORDER = [
  'database',
  'market_snapshot',
  'source_coverage',
  'admin_token',
  'ai_research_pipeline'
] as const;

const CHECK_LABELS: Record<string, string> = {
  database: '数据库',
  market_snapshot: '市场快照',
  source_coverage: '来源覆盖',
  admin_token: '管理令牌',
  ai_research_pipeline: 'AI 研究流水线'
};

function fetchTimeoutMs(): number {
  const parsed = Number(process.env.JETSCOPE_READINESS_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 100) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function readinessStatusLabel(status: string): string {
  if (status === 'ready') return '可上线候选';
  if (status === 'degraded') return '可运行，需复核';
  if (status === 'not_ready') return '未就绪';
  return status;
}

function checkStatusLabel(status: string): string {
  if (status === 'ok') return '正常';
  if (status === 'degraded') return '降级';
  if (status === 'missing') return '缺少配置';
  if (status === 'disabled') return '未启用';
  if (status === 'missing_credentials') return '缺少凭证';
  if (status === 'mock') return 'Mock 模式';
  if (status === 'seed') return '种子数据';
  if (status === 'error') return '错误';
  return status;
}

function actionFor(key: string, check: ReadinessCheck): Pick<LaunchReadinessCheck, 'actionLabel' | 'actionHref'> {
  if (key === 'source_coverage') {
    return { actionLabel: check.ok ? '查看来源' : '修复来源', actionHref: '/sources?filter=review' };
  }
  if (key === 'market_snapshot') {
    return { actionLabel: '查看市场', actionHref: '/sources' };
  }
  if (key === 'admin_token') {
    return { actionLabel: '配置管理令牌', actionHref: '/admin' };
  }
  if (key === 'ai_research_pipeline') {
    return { actionLabel: '打开研究工作台', actionHref: '/research' };
  }
  return { actionLabel: '查看 Admin', actionHref: '/admin' };
}

function toneFor(check: ReadinessCheck): LaunchReadinessCheck['tone'] {
  if (!check.ok) return 'critical';
  if (check.status === 'degraded' || check.status === 'mock' || check.status === 'seed') return 'review';
  return 'ok';
}

function normalizeChecks(checks: Record<string, ReadinessCheck> | undefined): LaunchReadinessCheck[] {
  const available = checks ?? {};
  const orderedKeys = [
    ...CHECK_ORDER,
    ...Object.keys(available).filter((key) => !CHECK_ORDER.includes(key as (typeof CHECK_ORDER)[number])).sort()
  ];

  return orderedKeys
    .filter((key) => available[key] != null)
    .map((key) => {
      const check = available[key];
      const action = actionFor(key, check);
      return {
        key,
        label: CHECK_LABELS[key] ?? key,
        ok: Boolean(check.ok),
        status: check.status,
        statusLabel: checkStatusLabel(check.status),
        detail: check.detail || '无详情',
        ...action,
        tone: toneFor(check)
      };
    });
}

function fallbackReadiness(error: unknown): LaunchReadinessReadModel {
  return {
    generatedAt: new Date().toISOString(),
    status: 'not_ready',
    statusLabel: '未就绪',
    ready: false,
    degraded: false,
    environment: 'unknown',
    apiPrefix: '/v1',
    schemaBootstrapMode: 'unknown',
    checks: [],
    error: error instanceof Error ? error.message : 'readiness unavailable'
  };
}

export async function getLaunchReadinessReadModel(): Promise<LaunchReadinessReadModel> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs());
  try {
    const response = await fetch(buildApiUrl('/readiness'), {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`readiness HTTP ${response.status}`);
    }
    const payload = (await response.json()) as ReadinessResponse;
    return {
      generatedAt: payload.generated_at,
      status: payload.status,
      statusLabel: readinessStatusLabel(payload.status),
      ready: payload.ready,
      degraded: Boolean(payload.degraded),
      environment: payload.environment ?? 'unknown',
      apiPrefix: payload.api_prefix ?? '/v1',
      schemaBootstrapMode: payload.schema_bootstrap_mode ?? 'unknown',
      checks: normalizeChecks(payload.checks),
      error: null
    };
  } catch (error) {
    return fallbackReadiness(error);
  } finally {
    clearTimeout(timeout);
  }
}
