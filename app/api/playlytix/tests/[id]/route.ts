import { NextResponse } from 'next/server';
import { fetchPlaylytixTestResponses, PlaylytixApiError } from '@/lib/playlytix/client';

// Thin authenticated proxy: the browser never sees PLAYLYTIX_API_KEY. Mapping
// the response into the dashboard's internal shape happens client-side in
// lib/playlytix/mapper.ts, same as Excel parsing does for uploads.
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Test id must be a number.' }, { status: 400 });
  }

  try {
    const payload = await fetchPlaylytixTestResponses(id);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof PlaylytixApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch test data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
