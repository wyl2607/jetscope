// Production (static export + Nginx proxy): leave empty for same-origin requests.
// Local dev: set JETSCOPE_API_BASE_URL=http://127.0.0.1:8000
function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizeApiPrefix(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

function normalizeApiPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '');
  return trimmed ? `/${trimmed}` : '';
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.JETSCOPE_API_BASE_URL ?? process.env.SAFVSOIL_API_BASE_URL ?? ''
);
export const API_PREFIX = normalizeApiPrefix(process.env.JETSCOPE_API_PREFIX ?? process.env.SAFVSOIL_API_PREFIX ?? '/v1');
export const WORKSPACE_SLUG = process.env.JETSCOPE_WORKSPACE_SLUG ?? process.env.SAFVSOIL_WORKSPACE_SLUG ?? 'default';

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${normalizeApiPath(path)}`;
}
