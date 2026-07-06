import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service-role key. This is the ONLY
 * place tester PII is read or written. The service role bypasses RLS, so the
 * `testers` table can keep RLS enabled with no public policies — the browser
 * (anon key) can never reach it.
 *
 * Returns null when the backend isn't configured yet, so the app degrades
 * gracefully (feedback still parses; testers just aren't enriched).
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (cached) return cached;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isBackendConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
