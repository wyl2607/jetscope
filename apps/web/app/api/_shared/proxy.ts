import { NextResponse } from 'next/server';
import { API_BASE_URL, API_PREFIX } from '@/lib/api-config';

const DEFAULT_PROXY_TIMEOUT_MS = 8000;

function proxyTimeoutMs(): number {
  const value = Number(process.env.JETSCOPE_API_PROXY_TIMEOUT_MS ?? DEFAULT_PROXY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROXY_TIMEOUT_MS;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), proxyTimeoutMs());
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function proxyToApi(
  request: Request,
  apiPath: string
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const url = `${API_BASE_URL}${API_PREFIX}${apiPath}${requestUrl.search}`;
  const headers = new Headers(request.headers);
  // Remove hop-by-hop headers that should not be forwarded
  headers.delete('host');
  headers.delete('content-length');

  try {
    const upstream = await fetchWithTimeout(url, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    });

    const body = await upstream.text();
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding'].includes(key)) {
        responseHeaders.set(key, value);
      }
    });

    return new NextResponse(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const message = isTimeout
      ? 'Upstream API timed out'
      : error instanceof Error
        ? error.message
        : 'Proxy request failed';
    return NextResponse.json({ error: message }, { status: isTimeout ? 504 : 502 });
  }
}
