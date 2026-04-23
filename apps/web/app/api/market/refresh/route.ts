import { proxyToApi } from '@/app/api/_shared/proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return proxyToApi(request, '/market/refresh');
}
