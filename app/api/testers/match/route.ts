import { NextResponse } from 'next/server';
import type { MatchRequest, MatchResult } from '@/lib/registry';
import { matchTestersByEmail } from '@/lib/supabase/testers';
import { isBackendConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Graceful degradation: if the backend isn't set up, return no matches so the
  // upload flow keeps working with unmatched (placeholder) testers.
  if (!isBackendConfigured()) {
    return NextResponse.json({ matches: {} } satisfies MatchResult);
  }

  let body: MatchRequest;
  try {
    body = (await req.json()) as MatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const emails = body?.emails;
  if (!Array.isArray(emails)) {
    return NextResponse.json({ error: 'emails must be an array.' }, { status: 400 });
  }

  try {
    const matches = await matchTestersByEmail(emails);
    return NextResponse.json({ matches } satisfies MatchResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Match failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
