import { NextResponse } from 'next/server';
import type { ImportRequest, ImportResult } from '@/lib/registry';
import { upsertTesters } from '@/lib/supabase/testers';
import { isBackendConfigured } from '@/lib/supabase/server';
import { requireDashboardAuth } from '@/lib/server/requestAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const authError = requireDashboardAuth(req);
  if (authError) return authError;
  if (!isBackendConfigured()) {
    return NextResponse.json(
      { error: 'Tester registry backend is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 },
    );
  }

  let body: ImportRequest;
  try {
    body = (await req.json()) as ImportRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const records = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'No registry records provided.' }, { status: 400 });
  }
  if (records.length > 100000) {
    return NextResponse.json({ error: 'Too many registry records in one request.' }, { status: 413 });
  }

  try {
    const upserted = await upsertTesters(records);
    const result: ImportResult = { upserted, total: records.length };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
