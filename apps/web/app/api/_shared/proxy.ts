import { NextResponse } from 'next/server';
import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_PROXY_TIMEOUT_MS = 8000;

/** Stable public messages — never forward Error.message or upstream URLs. */
export const PROXY_TIMEOUT_ERROR = 'Upstream API timed out';
export const PROXY_UNAVAILABLE_ERROR = 'Upstream API unavailable';

function proxyTimeoutMs(): number {
  const value = Number(process.env.JETSCOPE_API_PROXY_TIMEOUT_MS ?? DEFAULT_PROXY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROXY_TIMEOUT_MS;
}

function newCorrelationId(): string {
  return crypto.randomUUID();
}

function logProxyFailure(details: {
  correlationId: string;
  route: string;
  isTimeout: boolean;
  error: unknown;
}): void {
  const { correlationId, route, isTimeout, error } = details;
  const err =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

  // Server-side only. Operators join public { correlationId } to this line.
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'proxy_upstream_failure',
      correlationId,
      route,
      isTimeout,
      error: err
    })
  );
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

/**
 * Forward a browser request to the FastAPI upstream.
 *
 * On transport failure the public body is always:
 *   { "error": string, "correlationId": string }
 * with HTTP 504 (timeout) or 502 (other). The original exception is logged
 * server-side with the same correlationId and is never returned to clients.
 */
export async function proxyToApi(
  request: Request,
  apiPath: string
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const url = `${buildApiUrl(apiPath)}${requestUrl.search}`;
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
    const correlationId = newCorrelationId();
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    logProxyFailure({ correlationId, route: apiPath, isTimeout, error });

    const publicError = isTimeout ? PROXY_TIMEOUT_ERROR : PROXY_UNAVAILABLE_ERROR;
    return NextResponse.json(
      { error: publicError, correlationId },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
