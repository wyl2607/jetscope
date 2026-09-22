export const PUBLIC_PROXY_ERROR = 'Upstream API unavailable';

export type ProxyFailure = {
  status: 502 | 504;
  publicBody: {
    error: typeof PUBLIC_PROXY_ERROR;
    request_id: string;
  };
  internalMessage: string;
};

export function classifyProxyFailure(
  error: unknown,
  requestId: string
): ProxyFailure {
  const isTimeout = error instanceof Error && error.name === 'AbortError';

  return {
    status: isTimeout ? 504 : 502,
    publicBody: {
      error: PUBLIC_PROXY_ERROR,
      request_id: requestId
    },
    internalMessage: error instanceof Error ? error.message : String(error)
  };
}
