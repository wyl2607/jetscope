import { proxyToApi } from '@/app/api/_shared/proxy';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ eventId: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { eventId } = await params;
  return proxyToApi(request, `/events/${encodeURIComponent(eventId)}`);
}
