import { NextResponse } from 'next/server';
import { API_BASE_URL, API_PREFIX, WORKSPACE_SLUG } from '@/lib/api-config';

type ProxyOptions = {
  request: Request;
  scenarioId?: string;
};

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
    const upstream = await fetch(baseUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await readResponseBody(upstream);

    if (!upstream.ok) {
      const { error, detail } = extractErrorDetail(body);
      return jsonError(upstream.status, error, detail);
    }

    if (!Array.isArray(body)) {
      return jsonError(502, 'Invalid upstream response', 'Expected scenario list from upstream');
    }

    const matched = body.find((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      return (item as Record<string, unknown>).id === scenarioId;
    });

    if (!matched) {
      return jsonError(404, 'Scenario not found', `Scenario ${scenarioId} not found`);
    }

    return NextResponse.json(matched, { status: 200 });
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
  const detail = error instanceof Error ? error.message : 'Unknown proxy error';
  return jsonError(502, 'Failed to reach upstream scenarios service', detail);
}
