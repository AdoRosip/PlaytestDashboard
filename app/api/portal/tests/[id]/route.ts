import { portalApi } from '@/lib/server/portalApi';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return portalApi(request, (await params).id);
}
