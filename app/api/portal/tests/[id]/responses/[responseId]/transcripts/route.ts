import { portalTranscripts } from '@/lib/server/portalApi';
export async function GET(request: Request, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const { id, responseId } = await params;
  return portalTranscripts(request, id, responseId);
}
