export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ service: 'web', commit: process.env.JETSCOPE_BUILD_SHA });
}
