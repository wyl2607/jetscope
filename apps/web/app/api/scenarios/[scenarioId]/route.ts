import { proxyScenariosRequest, toProxyFailure } from '@/app/api/_shared/scenarios-proxy';

type RouteContext = {
  params: Promise<{ scenarioId: string }>;
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scenarioId } = await context.params;
    return await proxyScenariosRequest({ request, scenarioId });
  } catch (error) {
    return toProxyFailure(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scenarioId } = await context.params;
    return await proxyScenariosRequest({ request, scenarioId });
  } catch (error) {
    return toProxyFailure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scenarioId } = await context.params;
    return await proxyScenariosRequest({ request, scenarioId });
  } catch (error) {
    return toProxyFailure(error);
  }
}
