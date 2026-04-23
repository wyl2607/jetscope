import { NextResponse } from 'next/server';
import { API_BASE_URL, API_PREFIX } from '@/lib/api-config';

export async function proxyToApi(
  request: Request,
  apiPath: string
): Promise<Response> {
  const url = `${API_BASE_URL}${API_PREFIX}${apiPath}`;
  const headers = new Headers(request.headers);
  // Remove hop-by-hop headers that should not be forwarded
  headers.delete('host');
  headers.delete('content-length');

  try {
    const upstream = await fetch(url, {
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
    const message = error instanceof Error ? error.message : 'Proxy request failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
