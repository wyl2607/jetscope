import { proxyScenariosRequest, toProxyFailure } from '@/app/api/_shared/scenarios-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    return await proxyScenariosRequest({ request });
  } catch (error) {
    return toProxyFailure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await proxyScenariosRequest({ request });
  } catch (error) {
    return toProxyFailure(error);
  }
}
