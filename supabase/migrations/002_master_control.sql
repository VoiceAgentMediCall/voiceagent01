-- ============================================================
-- Migration 002 — Master Control + role-gated access
-- Date: 2026-06-22
-- Spec: docs/2026-06-22-master-control-spec.md
-- ============================================================

begin;

-- 0. Add is_master boolean flag — master admins cannot be demoted or removed by anyone,
--    not even by other admins. This protects the org from accidental lockout AND from
--    a rogue/compromised admin demoting a founder. Granted ONLY via SQL Editor in Phase 0
--    (no UI action) to keep the bar high. Multiple master admins are supported.
alter table public.users
  add column if not exists is_master boolean not null default false;

comment on column public.users.is_master is
  'When true, this user cannot be demoted/removed via the Master Control UI. Must always be role=admin. Set only via SQL Editor.';

-- 1. Migrate legacy 'operator' role to 'editor' (semantic rename — 001 schema used 'operator')
--    Idempotent: only affects rows that still have the legacy value.
update public.users set role = 'editor' where role = 'operator';

-- 2. Reset the column default — 001 set it to 'operator' which would now violate the new check.
--    The handle_new_user trigger sets role explicitly on every signup, so default is a safety net only.
alter table public.users alter column role set default 'pending';

-- 3. Drop the old check constraint (001 allowed admin/operator/viewer) and recreate
--    with the new 4-value set (admin/editor/viewer/pending).
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('admin', 'editor', 'viewer', 'pending'));

-- 2. allowed_emails: invite list (admin pre-adds emails; trigger consumes on signup)
create table if not exists public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid references public.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_user_id uuid references public.users(id) on delete set null,
  notes text
);

create index if not exists allowed_emails_email_idx on public.allowed_emails (lower(email));

-- 3. audit_log: append-only history of permission-changing actions
do $$ begin
  create type audit_action as enum (
    'invite_added',
    'invite_removed',
    'user_role_changed',
    'user_removed',
    'first_sign_in'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action audit_action not null,
  actor_user_id uuid references public.users(id) on delete set null,
  target_email text,
  target_user_id uuid references public.users(id) on delete set null,
  previous_role text,
  new_role text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_target_user_idx on public.audit_log (target_user_id, created_at desc);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

-- 4. call_logs: legacy transcript fallback column
alter table public.call_logs
  add column if not exists legacy_transcript_text text;

comment on column public.call_logs.legacy_transcript_text is
  'Free-text transcript excerpt from pre-Supabase Vapi/Apps-Script era. Set only on rows migrated from the Google Sheet. New rows use the structured transcript jsonb instead.';

-- 5. Rewrite handle_new_user trigger to be allowlist-aware
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record record;
  assigned_role text;
begin
  select id, role into invite_record
  from public.allowed_emails
  where lower(email) = lower(new.email)
    and consumed_at is null
  limit 1;

  if found then
    assigned_role := invite_record.role;
    update public.allowed_emails
    set consumed_at = now(),
        consumed_user_id = new.id
    where id = invite_record.id;
  else
    assigned_role := 'pending';
  end if;

  insert into public.users (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    assigned_role
  )
  on conflict (id) do nothing;

  insert into public.audit_log (action, target_email, target_user_id, new_role, notes)
  values (
    'first_sign_in',
    new.email,
    new.id,
    assigned_role,
    case when assigned_role = 'pending' then 'Email not in allowlist' else null end
  );

  return new;
end;
$$;

-- 6. Seed: backfill Shubh as admin + master + invite-row
update public.users
  set role = 'admin', is_master = true
  where email = 'dasshriyans2802@gmail.com';

-- Enforce invariant: master implies admin (defense at the DB layer so no
-- accidental SQL update can leave a non-admin master).
alter table public.users
  drop constraint if exists users_master_implies_admin;
alter table public.users
  add constraint users_master_implies_admin
  check (is_master = false or role = 'admin');

insert into public.allowed_emails (email, role, consumed_at, consumed_user_id)
select 'dasshriyans2802@gmail.com', 'admin', now(), id
from public.users where email = 'dasshriyans2802@gmail.com'
on conflict (email) do nothing;

-- 7. Enable RLS with permissive policies (matches 001's posture: RLS on, permissive
--    for now — Phase A will tighten with proper per-role / per-org policies).
alter table public.allowed_emails enable row level security;
drop policy if exists allowed_emails_all on public.allowed_emails;
create policy allowed_emails_all on public.allowed_emails for all using (true) with check (true);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_all on public.audit_log;
create policy audit_log_all on public.audit_log for all using (true) with check (true);

commit;
