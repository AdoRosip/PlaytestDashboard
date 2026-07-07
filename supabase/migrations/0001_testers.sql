-- Master tester registry (cross-game). Sourced from the Playlytix registration
-- export, enriched with the "Type of Gamer" genres/playstyles. Contains PII, so
-- it is reachable ONLY via the service-role key from Next.js server code.
--
-- RLS is enabled with NO policies: the anon/public key can never read or write
-- this table; the service role bypasses RLS. Never expose the service-role key
-- to the browser.

create table if not exists public.testers (
  email        text primary key,          -- normalized: trimmed + lowercased
  playlytix_id integer,                    -- stable cross-game id (1..N); null if unknown
  discord      text,
  segments     jsonb not null default '{}'::jsonb,  -- keyed by SegmentKey (age_group, gender, country, ... genres, playstyles, hardware_tier)
  cpu          text,
  gpu          text,
  ram          text,
  steam64      text,
  epic         text,
  psn          text,
  xbox         text,
  raw_json     jsonb,
  updated_at   timestamptz not null default now()
);

create index if not exists testers_playlytix_id_idx on public.testers (playlytix_id);

alter table public.testers enable row level security;
-- Intentionally no policies. Only the service role (which bypasses RLS) has access.
