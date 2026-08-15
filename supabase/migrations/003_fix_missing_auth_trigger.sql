-- ============================================================
-- Migration 003 — Fix missing auth.users trigger
-- Date: 2026-08-15
-- ============================================================
--
-- Bug: migration 002 introduced (or replaced) the `handle_new_user()`
-- function, but never actually created the trigger that's supposed to call
-- it on every `auth.users` insert. The function existed and was correct;
-- nothing was ever wired to run it.
--
-- Effect: every signup, since this project was set up, silently got no row
-- in `public.users` at all — no role, no allowlist consumption, nothing.
-- Confirmed live on 2026-08-15: `public.users` was completely empty despite
-- multiple confirmed accounts existing in `auth.users`.
--
-- Fix: create the trigger. `drop trigger if exists` first makes this safe
-- to re-run.
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Post-migration verification (run in SQL Editor)
-- ============================================================
-- select tgname, tgenabled from pg_trigger where tgname = 'on_auth_user_created';
-- -- Expected: one row, tgenabled = 'O' (enabled)
--
-- If any accounts signed up BEFORE this migration ran, they will NOT have a
-- retroactive public.users row — the trigger only fires on INSERT. Fix those
-- manually, e.g.:
--
--   insert into public.users (id, email, display_name, role)
--   select id, email, email, 'admin' from auth.users where email = '<email>'
--   on conflict (id) do update set role = 'admin';
