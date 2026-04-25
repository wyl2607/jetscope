// Production (static export + Nginx proxy): leave empty for same-origin requests.
// Local dev: set JETSCOPE_API_BASE_URL=http://127.0.0.1:8000
export const API_BASE_URL = process.env.JETSCOPE_API_BASE_URL ?? process.env.SAFVSOIL_API_BASE_URL ?? '';
export const API_PREFIX = process.env.JETSCOPE_API_PREFIX ?? process.env.SAFVSOIL_API_PREFIX ?? '/v1';
export const WORKSPACE_SLUG = process.env.JETSCOPE_WORKSPACE_SLUG ?? process.env.SAFVSOIL_WORKSPACE_SLUG ?? 'default';

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${path}`;
}
