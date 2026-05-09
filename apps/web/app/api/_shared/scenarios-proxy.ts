import { NextResponse } from 'next/server';
import { API_BASE_URL, API_PREFIX, WORKSPACE_SLUG } from '@/lib/api-config';

type ProxyOptions = {
  request: Request;
  scenarioId?: string;
};

const DEFAULT_PROXY_TIMEOUT_MS = 8000;

function proxyTimeoutMs(): number {
  const value = Number(process.env.JETSCOPE_API_PROXY_TIMEOUT_MS ?? DEFAULT_PROXY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROXY_TIMEOUT_MS;
}

function scenariosBaseUrl(): string {
  return `${API_BASE_URL}${API_PREFIX}/workspaces/${encodeURIComponent(WORKSPACE_SLUG)}/scenarios`;
}

function jsonError(status: number, error: string, detail?: unknown): NextResponse {
  return NextResponse.json(
    {
      error,
      detail: detail ?? error,
      status,
    },
    { status }
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractErrorDetail(body: unknown): { error: string; detail: unknown } {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const error =
      typeof record.error === 'string'
        ? record.error
        : typeof record.detail === 'string'
          ? record.detail
          : 'Upstream request failed';
    return { error, detail: record.detail ?? record.error ?? body };
  }

  if (typeof body === 'string' && body.trim()) {
    return { error: body, detail: body };
  }

  return { error: 'Upstream request failed', detail: body };
}

async function forwardToBackend(url: string, request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  const headers = new Headers();
  headers.set('accept', 'application/json');

  if (method !== 'GET') {
    const adminToken = request.headers.get('x-admin-token');
    if (adminToken) {
      headers.set('x-admin-token', adminToken);
    }
  }

  const contentType = request.headers.get('content-type');
  const hasBody = method === 'POST' || method === 'PUT';
  let body: string | undefined;

  if (hasBody) {
    body = await request.text();
    if (contentType) {
      headers.set('content-type', contentType);
    }
  }

  return fetch(url, {
    method,
    headers,
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(proxyTimeoutMs()),
  });
}

export async function proxyScenariosRequest(options: ProxyOptions): Promise<Response> {
  const { request, scenarioId } = options;
  const method = request.method.toUpperCase();
  const baseUrl = scenariosBaseUrl();

  if (!scenarioId) {
    const upstream = await forwardToBackend(baseUrl, request);
    const body = await readResponseBody(upstream);

    if (!upstream.ok) {
      const { error, detail } = extractErrorDetail(body);
      return jsonError(upstream.status, error, detail);
    }

    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(body, { status: upstream.status });
  }

  if (method === 'GET') {
    const upstreamUrl = `${baseUrl}/${encodeURIComponent(scenarioId)}`;
    const upstream = await forwardToBackend(upstreamUrl, request);
    const body = await readResponseBody(upstream);

    if (!upstream.ok) {
      const { error, detail } = extractErrorDetail(body);
      return jsonError(upstream.status, error, detail);
    }

    return NextResponse.json(body, { status: upstream.status });
  }

  const upstreamUrl = `${baseUrl}/${encodeURIComponent(scenarioId)}`;
  const upstream = await forwardToBackend(upstreamUrl, request);
  const body = await readResponseBody(upstream);

  if (!upstream.ok) {
    const { error, detail } = extractErrorDetail(body);
    return jsonError(upstream.status, error, detail);
  }

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(body, { status: upstream.status });
}

export function toProxyFailure(error: unknown): Response {
  const isTimeout = error instanceof Error && error.name === 'TimeoutError';
  const detail = isTimeout
    ? 'Upstream scenarios service timed out'
    : error instanceof Error
      ? error.message
      : 'Unknown proxy error';
  return jsonError(isTimeout ? 504 : 502, 'Failed to reach upstream scenarios service', detail);
}
