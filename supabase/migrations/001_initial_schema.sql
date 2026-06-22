-- ============================================================
-- Migration 001: initial schema
-- Source: PRD-TRD.md §17 (authoritative DDL)
-- Apply via: Supabase SQL Editor (medicall-prod, ap-south-1)
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Users (extends Supabase Auth)
-- ------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null check (role in ('admin', 'operator', 'viewer')) default 'operator',
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Versioned prompts
-- ------------------------------------------------------------
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  system_prompt text not null,
  first_message text not null,
  variables jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  notes text
);
-- Enforce only ONE active prompt at a time.
create unique index prompts_one_active on public.prompts (is_active) where is_active;
create index prompts_version_idx on public.prompts (version desc);

-- ------------------------------------------------------------
-- Parents (schedule)
-- ------------------------------------------------------------
create table public.parents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  drug_name text not null,
  scheduled_time time,  -- local IST
  caregiver_email text,
  active boolean default true,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Call logs
-- ------------------------------------------------------------
create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  call_id text not null unique,  -- LiveKit call_id, idempotency key
  parent_id uuid references public.parents(id),
  phone text not null,
  outcome text check (outcome in ('CONFIRMED', 'DENIED', 'ESCALATED', 'NO_ANSWER', 'ERROR')),
  outcome_source text check (outcome_source in ('tool_call', 'json_trailer', 'keyword_match', 'watchdog', 'voicemail_detector')),
  reason text,
  transcript jsonb,
  duration_sec int,
  prompt_version int,
  stack text default 'livekit',
  raw_payload jsonb,
  langfuse_trace_id text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);
create index call_logs_phone_idx on public.call_logs (phone, created_at desc);
create index call_logs_outcome_idx on public.call_logs (outcome, created_at desc);

-- ------------------------------------------------------------
-- Eval runs
-- ------------------------------------------------------------
create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by uuid references public.users(id),
  prompt_version int,
  goldenset_sha text,  -- git sha of goldenset.yaml at run time
  status text check (status in ('queued', 'running', 'passed', 'failed', 'errored')) default 'queued',
  scenarios_total int,
  scenarios_passed int,
  results jsonb,
  error_log text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Notification trigger for Promptfoo runner
-- Promptfoo eval-runner LISTENs on channel 'eval_runs_queue'.
-- ------------------------------------------------------------
create or replace function notify_eval_runs() returns trigger as $$
begin
  if new.status = 'queued' then
    perform pg_notify('eval_runs_queue', json_build_object('id', new.id)::text);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger eval_runs_notify
  after insert on public.eval_runs
  for each row execute function notify_eval_runs();

-- ------------------------------------------------------------
-- Row Level Security
-- Per PRD-TRD §17 + §18: app-layer role checks in Next.js middleware,
-- no DB-level RLS enforcement for Phase 0. We enable RLS with a single
-- permissive policy per table so the posture is "RLS-on", and tightening
-- in Phase A (caregiver dashboard access) is a simple ALTER POLICY rather
-- than a destabilising ENABLE ROW LEVEL SECURITY migration.
-- ------------------------------------------------------------
alter table public.users     enable row level security;
alter table public.prompts   enable row level security;
alter table public.parents   enable row level security;
alter table public.call_logs enable row level security;
alter table public.eval_runs enable row level security;

create policy users_all     on public.users     for all using (true) with check (true);
create policy prompts_all   on public.prompts   for all using (true) with check (true);
create policy parents_all   on public.parents   for all using (true) with check (true);
create policy call_logs_all on public.call_logs for all using (true) with check (true);
create policy eval_runs_all on public.eval_runs for all using (true) with check (true);

-- ============================================================
-- Seed: initial active prompt v1 from voiceagent/admin-panel/prompts.yaml
-- ============================================================
-- IMPORTANT: this is intentionally LEFT EMPTY. The seed step is done by hand
-- in the Supabase SQL Editor immediately after running this migration, because
-- the live Hindi/Devanagari content is in voiceagent/admin-panel/prompts.yaml
-- and copy/pasting multi-line Unicode strings via this migration file is
-- error-prone (encoding, escaping). Run the seed query separately:
--
--   insert into public.prompts (version, system_prompt, first_message, variables, is_active)
--   values (1, '<paste system_prompt verbatim>', '<paste first_message>',
--           '{"parent_name":"Shubh","drug_name":"Crocin"}'::jsonb, true);

-- ============================================================
-- Post-migration verification (run these in SQL Editor)
-- ============================================================
-- select table_name from information_schema.tables where table_schema='public'
--   order by table_name;
-- -- Expected: call_logs, eval_runs, parents, prompts, users
--
-- select count(*) from public.prompts where is_active;
-- -- Expected after seed: 1
--
-- select tgname from pg_trigger where tgrelid = 'public.eval_runs'::regclass;
-- -- Expected: eval_runs_notify
--
-- select indexname from pg_indexes where tablename = 'prompts';
-- -- Expected to include: prompts_one_active, prompts_version_idx
