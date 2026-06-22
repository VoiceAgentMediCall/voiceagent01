# Master Control + Sheet Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict-allowlist 3-tier role system (admin/editor/viewer) with a Master Control admin tab, audit log, last-admin lockout protection, AND migrate legacy Google Sheet data into Supabase with production-grade two-pass transcript reconstruction.

**Architecture:** New Supabase tables (`allowed_emails`, `audit_log`) plus `handle_new_user` trigger rewrite gate signup at the DB. Next.js middleware checks `users.role` and bounces `pending` to `/not-authorized`. Six `/api/master/*` routes enforce admin-only with a `requireRole` helper. Existing tabs get UI-level + API-level role enforcement (disabled-with-tooltip pattern). Python migration script pulls Sheet CSVs, reconstructs structured transcripts from `raw_payload_json`, falls back to a new `legacy_transcript_text` column when raw_payload is malformed.

**Tech Stack:** Supabase Postgres (DDL + trigger functions) / Next.js 16 (route handlers, middleware, server + client components) / shadcn/ui (Badge, Table, Dialog, Select, AlertDialog) / Python 3.11 (migration script: `requests`, `csv`, `psycopg2-binary`)

**Companion spec:** [2026-06-22-master-control-spec.md](2026-06-22-master-control-spec.md) — every architectural decision is locked there. This plan operationalizes it.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `voiceagent/supabase/migrations/002_master_control.sql` | DDL: `allowed_emails`, `audit_log` tables; ALTER `call_logs` add `legacy_transcript_text`; rewrite `handle_new_user` trigger to be allowlist-aware; backfill Shubh's invite row |
| `voiceagent/dashboard/src/lib/auth.ts` | `requireRole()` helper used by every editing API route; `getCurrentUserRole()` helper for server components |
| `voiceagent/dashboard/src/app/not-authorized/page.tsx` | Public page rendered when `role === 'pending'`; shows friendly message + sign-out button |
| `voiceagent/dashboard/src/app/api/master/users/route.ts` | `GET` — list all users with role, last_sign_in, invite metadata |
| `voiceagent/dashboard/src/app/api/master/users/[id]/route.ts` | `PATCH` (change role with last-admin guard), `DELETE` (remove user with last-admin guard) |
| `voiceagent/dashboard/src/app/api/master/invites/route.ts` | `GET` (list unconsumed), `POST` (new invite) |
| `voiceagent/dashboard/src/app/api/master/invites/[id]/route.ts` | `DELETE` (cancel unconsumed invite) |
| `voiceagent/dashboard/src/app/api/master/audit/route.ts` | `GET` — paginated audit log entries |
| `voiceagent/dashboard/src/app/(app)/master/page.tsx` | Master Control UI: 4 sections (members, invites, invite form, audit log) |
| `voiceagent/dashboard/src/components/role-gate.tsx` | Client component that disables children + shows tooltip when user lacks required role |
| `voiceagent/scripts/migrate_sheet_to_supabase.py` | Production-grade migration with two-pass transcript reconstruction + `--dry-run` |
| `voiceagent/migrations/.gitkeep` | Marker so the log directory exists; logs themselves gitignored |

### Modified files

| Path | What changes |
|---|---|
| `voiceagent/dashboard/src/middleware.ts` | Add role-lookup; redirect `pending` to `/not-authorized`; propagate `x-user-role` header |
| `voiceagent/dashboard/src/app/(app)/layout.tsx` | Read role server-side; pass to `Sidebar` as prop |
| `voiceagent/dashboard/src/components/sidebar.tsx` | Accept `role` prop; conditionally render Master Control row when role=admin |
| `voiceagent/dashboard/src/lib/types.ts` | Append `UserRole`, `AllowedEmail`, `AuditLogEntry`, `MemberRow` types |
| `voiceagent/dashboard/src/app/api/prompts/route.ts` | Wrap POST with `requireRole('admin','editor')` |
| `voiceagent/dashboard/src/app/api/parents/route.ts` | Wrap POST with `requireRole('admin','editor')` |
| `voiceagent/dashboard/src/app/api/parents/[id]/route.ts` | Wrap PATCH + DELETE with `requireRole('admin','editor')` |
| `voiceagent/dashboard/src/app/api/eval/trigger/route.ts` | Wrap POST with `requireRole('admin','editor')` |
| `voiceagent/dashboard/src/app/api/livekit-token/route.ts` | Wrap GET with `requireRole('admin','editor')` |
| `voiceagent/dashboard/src/app/(app)/admin/page.tsx` | Read role; disable Save button + textareas with tooltip when viewer |
| `voiceagent/dashboard/src/app/(app)/schedule/page.tsx` | Read role; hide Add form + Delete buttons when viewer |
| `voiceagent/dashboard/src/app/(app)/test/page.tsx` | Read role; disable Connect button with tooltip when viewer |
| `voiceagent/dashboard/src/app/(app)/evals/page.tsx` | Read role; disable Run goldenset button with tooltip when viewer |
| `voiceagent/dashboard/src/app/(app)/calls/page.tsx` | Show `legacy_transcript_text` with "Legacy excerpt" badge when `transcript` is null |
| `voiceagent/.gitignore` | Add `voiceagent/migrations/*.log` (migration audit logs) |

---

## PART A: Manual setup (Shubh)

> Two short manual steps. Total time: ~2 min.

### Task A1: Apply schema migration 002 to Supabase

**Files:**
- Read: `voiceagent/supabase/migrations/002_master_control.sql` (created by Task B1)

- [ ] **Step 1: Wait for Task B1 to create the migration file** (Task B1 is the first agent task — runs before this)

- [ ] **Step 2: Open Supabase SQL Editor**

```
https://supabase.com/dashboard/project/alzdxsjkvkqmvhrmbkrc/sql/new
```

- [ ] **Step 3: Paste entire contents of `002_master_control.sql` and click Run**

Expected: "Success. No rows returned." Verify the new tables and column exist:

```sql
select table_name from information_schema.tables
where table_schema='public' order by table_name;
-- Expected to include: allowed_emails, audit_log (plus the existing 5)

select column_name from information_schema.columns
where table_name='call_logs' and column_name='legacy_transcript_text';
-- Expected: 1 row

select email, role from public.allowed_emails;
-- Expected: 1 row — dasshriyans2802@gmail.com, admin

select role from public.users where email='dasshriyans2802@gmail.com';
-- Expected: 'admin'
```

- [ ] **Step 4: Tell the controller "schema 002 applied"** so subsequent agent tasks can proceed safely

---

### Task A2: Run migration script (after Task B12 ships it)

**Files:** none

- [ ] **Step 1: Wait for Task B12 to write `voiceagent/scripts/migrate_sheet_to_supabase.py`**

- [ ] **Step 2: Publish the Google Sheet tabs to web as CSV (if not already)**

In the Sheet:
1. File → Share → Publish to web
2. Select sheet `schedule` → Format: Comma-separated values (.csv) → Publish
3. Repeat for sheet `call_logs`
4. Copy both URLs

If the sheet is already published, the URLs look like:
```
https://docs.google.com/spreadsheets/d/14YRMj_QQJ_2Y58pcylfyicCX9qnMF-znltQyvaDqufY/export?format=csv&gid=0
https://docs.google.com/spreadsheets/d/14YRMj_QQJ_2Y58pcylfyicCX9qnMF-znltQyvaDqufY/export?format=csv&gid=46029314
```

- [ ] **Step 3: Run dry-run**

```powershell
cd "C:\Users\SHUBH SANKALP DAS\Desktop\Building\voiceagent"
$env:SUPABASE_DB_URL = "postgresql://postgres.alzdxsjkvkqmvhrmbkrc:RwEXSnc7U7YSB7yr@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
$env:SCHEDULE_CSV_URL = "<URL from Step 2>"
$env:CALL_LOGS_CSV_URL = "<URL from Step 2>"

python scripts/migrate_sheet_to_supabase.py --dry-run
```

Expected: prints "DRY RUN" header, then row counts (parents: N, call_logs: M), then list of warnings/skips. Writes nothing to Supabase. Log file written to `voiceagent/migrations/2026-06-22-sheet-import.log`.

- [ ] **Step 4: Review the log file** — confirm row counts look right and no critical errors

- [ ] **Step 5: Run for real**

```powershell
python scripts/migrate_sheet_to_supabase.py
```

Expected: same row counts as dry-run, "MIGRATION COMPLETE" footer. Verify in Supabase:

```sql
select stack, count(*) from public.call_logs group by stack;
-- Expected: livekit=1 (smoke-test-1), vapi=<row count from sheet>

select count(*) from public.parents;
-- Expected: matches parents count from dry-run
```

- [ ] **Step 6: Tell the controller "migration complete"**

---

## PART B: Agent build (subagents)

> Sequenced. Each task is one subagent dispatch. Skill: `superpowers:subagent-driven-development`.

---

### Task B1: Write SQL migration 002

**Files:**
- Create: `voiceagent/supabase/migrations/002_master_control.sql`

- [ ] **Step 1: Read existing schema for reference**

```
voiceagent/supabase/migrations/001_initial_schema.sql
```
Confirm: `users.role text check (role in ('admin', 'editor', 'viewer'))`. We need to **also accept** `'pending'`. Plan: drop the check constraint, re-add with `pending` included.

- [ ] **Step 2: Write the migration file**

Create `voiceagent/supabase/migrations/002_master_control.sql`:

```sql
-- ============================================================
-- Migration 002 — Master Control + role-gated access
-- Date: 2026-06-22
-- Spec: docs/2026-06-22-master-control-spec.md
-- ============================================================

begin;

-- 1. Extend users.role to allow 'pending' (default for non-allowlisted signups)
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

-- 6. Seed: backfill Shubh as admin + invite-row
update public.users set role = 'admin' where email = 'dasshriyans2802@gmail.com';

insert into public.allowed_emails (email, role, consumed_at, consumed_user_id)
select 'dasshriyans2802@gmail.com', 'admin', now(), id
from public.users where email = 'dasshriyans2802@gmail.com'
on conflict (email) do nothing;

commit;
```

- [ ] **Step 3: Self-verify the SQL parses**

```bash
# Quick syntax check using PostgreSQL parser via psql if available, or just visually:
grep -c "create " voiceagent/supabase/migrations/002_master_control.sql
# Expected: ≥ 3 (allowed_emails table, audit_log table, trigger function)
```

- [ ] **Step 4: Do NOT apply — Task A1 is the human apply step**

- [ ] **Step 5: Commit at end of plan (batched)** — do not commit individual tasks

---

### Task B2: requireRole helper + getCurrentUserRole

**Files:**
- Create: `voiceagent/dashboard/src/lib/auth.ts`

- [ ] **Step 1: Inspect existing supabase helpers**

Read `dashboard/src/lib/supabase/server.ts` to confirm the async `createClient()` pattern (Next 16 `await cookies()`).

- [ ] **Step 2: Write the helper**

Create `voiceagent/dashboard/src/lib/auth.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type Role = 'admin' | 'editor' | 'viewer' | 'pending'

export type AuthSuccess = {
  ok: true
  userId: string
  email: string
  role: Role
}

export type AuthFailure = {
  ok: false
  response: NextResponse
}

/**
 * Server-side guard for API routes.
 * Returns either { ok: true, userId, email, role } or a NextResponse to return immediately.
 */
export async function requireRole(...allowed: Role[]): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'profile not found' }, { status: 403 }),
    }
  }

  const role = profile.role as Role
  if (!allowed.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `forbidden — requires ${allowed.join(' or ')}`, role },
        { status: 403 }
      ),
    }
  }

  return { ok: true, userId: user.id, email: user.email!, role }
}

/**
 * Server component helper — returns role or 'pending'/null without throwing.
 * Useful in (app)/layout.tsx to read role once and pass down via prop.
 */
export async function getCurrentUserRole(): Promise<{ userId: string; email: string; role: Role } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email!,
    role: (profile?.role as Role) ?? 'pending',
  }
}
```

- [ ] **Step 3: No tests required at this layer** — these are thin wrappers around Supabase; correctness is exercised by integration tests in later tasks (B5-B9 API route smoke tests).

---

### Task B3: Update middleware for role-based routing

**Files:**
- Modify: `voiceagent/dashboard/src/middleware.ts`

- [ ] **Step 1: Read current middleware**

```
voiceagent/dashboard/src/middleware.ts
```

Confirm current PUBLIC_PATHS includes `['/login', '/auth', '/api/webhook']`.

- [ ] **Step 2: Update PUBLIC_PATHS + add role gate**

Edit `middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/login', '/auth', '/api/webhook', '/not-authorized']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // For authenticated users, check role gate (pending → /not-authorized)
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role === 'pending') {
      return NextResponse.redirect(new URL('/not-authorized', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

- [ ] **Step 3: Smoke test (after dev server reload)**

The dev server is on Railway — hard to smoke locally without booting. Verify the file compiles by hitting:

```
curl.exe -s http://localhost:3000/_next/static/development/_buildManifest.js -o NUL -w "%{http_code}\n"
```

Expected: 200 (no compile error in middleware).

If running against the Railway deployment, sign out and back in with Shubh's account — should still work (role=admin, not pending).

---

### Task B4: /not-authorized page

**Files:**
- Create: `voiceagent/dashboard/src/app/not-authorized/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ShieldX, LogOut } from 'lucide-react'

export default function NotAuthorizedPage() {
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="w-full max-w-md p-8 space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-amber-100 dark:bg-amber-950/40 p-4">
            <ShieldX size={32} className="text-amber-600 dark:text-amber-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Access pending</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t on the MediCall AI access list yet.
          </p>
        </div>

        <div className="text-sm border rounded-md p-4 bg-muted/30 text-left">
          <p className="font-medium mb-1">To request access:</p>
          <p className="text-muted-foreground">
            Contact <span className="font-mono text-foreground">dasshriyans2802@gmail.com</span> with
            the email address you signed in with, and ask to be added.
          </p>
        </div>

        <Button variant="outline" onClick={signOut} className="w-full">
          <LogOut size={14} className="mr-2" />
          Sign out
        </Button>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify it's in PUBLIC_PATHS** (already added in Task B3 middleware update)

- [ ] **Step 3: Smoke**: visit `/not-authorized` while signed in as admin — page renders. (No auth gate on this path.)

---

### Task B5: GET /api/master/users

**Files:**
- Create: `voiceagent/dashboard/src/app/api/master/users/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const supabase = await createClient()

  // Users with their consumed-invite metadata
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email, display_name, role, is_master, created_at')
    .order('created_at', { ascending: true })

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

  // Join with allowed_emails to get invited_by + last sign-in via auth.users.last_sign_in_at
  const { data: invites } = await supabase
    .from('allowed_emails')
    .select('email, invited_by, invited_at, consumed_user_id')

  const inviteByUserId = new Map(
    (invites ?? [])
      .filter((i) => i.consumed_user_id)
      .map((i) => [i.consumed_user_id!, i])
  )

  // Resolve invited_by display_name in a second pass
  const inviterIds = [...new Set((invites ?? []).map((i) => i.invited_by).filter(Boolean) as string[])]
  const { data: inviters } = inviterIds.length > 0
    ? await supabase.from('users').select('id, email, display_name').in('id', inviterIds)
    : { data: [] }
  const inviterMap = new Map((inviters ?? []).map((u) => [u.id, u]))

  const rows = (users ?? []).map((u) => {
    const invite = inviteByUserId.get(u.id)
    const inviter = invite?.invited_by ? inviterMap.get(invite.invited_by) : null
    return {
      ...u,
      invited_by: inviter
        ? { id: inviter.id, email: inviter.email, display_name: inviter.display_name }
        : null,
      invited_at: invite?.invited_at ?? null,
    }
  })

  return NextResponse.json(rows)
}
```

- [ ] **Step 2: Smoke test**

```powershell
# After signing in as Shubh and copying the supabase auth cookie:
curl.exe -s http://localhost:3000/api/master/users -b "your-cookie-here"
# Expected: JSON array with at least one row (Shubh's user) including role=admin
```

If curl with cookies is too fiddly, verify via the Master Control UI in Task B9.

---

### Task B6: POST/GET /api/master/invites + DELETE /api/master/invites/[id]

**Files:**
- Create: `voiceagent/dashboard/src/app/api/master/invites/route.ts`
- Create: `voiceagent/dashboard/src/app/api/master/invites/[id]/route.ts`

- [ ] **Step 1: List + create route**

`api/master/invites/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET() {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('allowed_emails')
    .select(`
      id, email, role, invited_at, consumed_at, notes,
      invited_by_user:users!allowed_emails_invited_by_fkey(id, email, display_name)
    `)
    .is('consumed_at', null)
    .order('invited_at', { ascending: false })

  if (error) {
    // Fallback to JS-side join if FK syntax fails
    const { data: invites } = await supabase
      .from('allowed_emails')
      .select('*')
      .is('consumed_at', null)
      .order('invited_at', { ascending: false })
    return NextResponse.json(invites ?? [])
  }
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const body = await req.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = body.role
  const notes = body.notes ? String(body.notes) : null

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid email format' }, { status: 400 })
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'role must be admin, editor, or viewer' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('allowed_emails')
    .insert({ email, role, notes, invited_by: auth.userId })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This email is already invited or already a member.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  await supabase.from('audit_log').insert({
    action: 'invite_added',
    actor_user_id: auth.userId,
    target_email: email,
    new_role: role,
    notes,
  })

  return NextResponse.json(data)
}
```

- [ ] **Step 2: Delete (cancel unconsumed) route**

`api/master/invites/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const { id } = await params
  const supabase = await createClient()

  // Only delete if not yet consumed
  const { data: invite, error: findErr } = await supabase
    .from('allowed_emails')
    .select('email, role, consumed_at')
    .eq('id', id)
    .maybeSingle()

  if (findErr || !invite) {
    return NextResponse.json({ error: 'invite not found' }, { status: 404 })
  }
  if (invite.consumed_at) {
    return NextResponse.json({ error: 'invite already consumed — remove the user instead' }, { status: 409 })
  }

  const { error } = await supabase.from('allowed_emails').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_log').insert({
    action: 'invite_removed',
    actor_user_id: auth.userId,
    target_email: invite.email,
    previous_role: invite.role,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Smoke test will happen in Task B9 UI**

---

### Task B7: PATCH /api/master/users/[id] — change role (last-admin + master-admin guards)

**Additional rules for this task** (over the spec):

1. **Cannot demote/remove a user where `is_master = true`** — even by another admin. Master status is set only via SQL Editor (Phase 0). API returns `409` with error `"Master admin cannot be demoted or removed — modify is_master via SQL Editor first."`
2. **Cannot grant `is_master` via this API** — no `is_master` field in PATCH body is honored. Silently ignore if sent.
3. The last-admin guard still runs; if a master is the last admin, BOTH guards apply (you can't demote them AND you can't remove them).

The route should:
- Fetch the target user including `is_master`
- If `target.is_master === true` and (newRole !== 'admin') → 409 reject
- If DELETE on master → 409 reject
- All other logic per the existing spec


**Files:**
- Create: `voiceagent/dashboard/src/app/api/master/users/[id]/route.ts`

- [ ] **Step 1: Write PATCH + DELETE**

```typescript
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

async function countAdmins(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>): Promise<number> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  return count ?? 0
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const { id: targetUserId } = await params
  const body = await req.json()
  const newRole = body.role

  if (!['admin', 'editor', 'viewer'].includes(newRole)) {
    return NextResponse.json({ error: 'role must be admin, editor, or viewer' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: targetUser, error: findErr } = await supabase
    .from('users')
    .select('id, email, role, is_master')
    .eq('id', targetUserId)
    .maybeSingle()

  if (findErr || !targetUser) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Master-admin guard — masters are immovable via this API
  if (targetUser.is_master && newRole !== 'admin') {
    return NextResponse.json(
      { error: 'Master admin cannot be demoted — modify is_master via SQL Editor first.' },
      { status: 409 }
    )
  }

  // Last-admin guard
  if (targetUser.role === 'admin' && newRole !== 'admin') {
    const adminCount = await countAdmins(supabase)
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "You're the only admin — promote someone else first." },
        { status: 409 }
      )
    }
  }

  const previousRole = targetUser.role
  const { error: updateErr } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', targetUserId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await supabase.from('audit_log').insert({
    action: 'user_role_changed',
    actor_user_id: auth.userId,
    target_email: targetUser.email,
    target_user_id: targetUserId,
    previous_role: previousRole,
    new_role: newRole,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const { id: targetUserId } = await params
  const supabase = await createClient()

  const { data: targetUser } = await supabase
    .from('users')
    .select('id, email, role, is_master')
    .eq('id', targetUserId)
    .maybeSingle()

  if (!targetUser) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // Master-admin guard — masters cannot be removed via this API
  if (targetUser.is_master) {
    return NextResponse.json(
      { error: 'Master admin cannot be removed — modify is_master via SQL Editor first.' },
      { status: 409 }
    )
  }

  if (targetUser.role === 'admin') {
    const adminCount = await countAdmins(supabase)
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "You're the only admin — promote someone else first." },
        { status: 409 }
      )
    }
  }

  // Cascade-delete from public.users (auth.users stays — Supabase doesn't allow public→auth deletes from app code)
  const { error: delErr } = await supabase.from('users').delete().eq('id', targetUserId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  await supabase.from('audit_log').insert({
    action: 'user_removed',
    actor_user_id: auth.userId,
    target_email: targetUser.email,
    target_user_id: targetUserId,
    previous_role: targetUser.role,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Test the last-admin guard manually after UI is built (Task B9)**

---

### Task B8: GET /api/master/audit

**Files:**
- Create: `voiceagent/dashboard/src/app/api/master/audit/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = await requireRole('admin')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500)

  const supabase = await createClient()
  const { data: entries, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Join with actor display_name
  const actorIds = [...new Set((entries ?? []).map((e) => e.actor_user_id).filter(Boolean) as string[])]
  const { data: actors } = actorIds.length > 0
    ? await supabase.from('users').select('id, email, display_name').in('id', actorIds)
    : { data: [] }
  const actorMap = new Map((actors ?? []).map((u) => [u.id, u]))

  const enriched = (entries ?? []).map((e) => ({
    ...e,
    actor: e.actor_user_id ? actorMap.get(e.actor_user_id) ?? null : null,
  }))

  return NextResponse.json(enriched)
}
```

---

### Task B9: Master Control UI page + sidebar + types

**Files:**
- Modify: `voiceagent/dashboard/src/lib/types.ts` (append)
- Modify: `voiceagent/dashboard/src/components/sidebar.tsx`
- Modify: `voiceagent/dashboard/src/app/(app)/layout.tsx`
- Create: `voiceagent/dashboard/src/app/(app)/master/page.tsx`

- [ ] **Step 1: Append types**

`voiceagent/dashboard/src/lib/types.ts` append:

```typescript
export type UserRole = 'admin' | 'editor' | 'viewer' | 'pending'

export type MemberRow = {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  is_master: boolean
  created_at: string
  invited_by: { id: string; email: string; display_name: string | null } | null
  invited_at: string | null
}

export type PendingInvite = {
  id: string
  email: string
  role: 'admin' | 'editor' | 'viewer'
  invited_at: string
  notes: string | null
  invited_by_user?: { id: string; email: string; display_name: string | null } | null
}

export type AuditLogEntry = {
  id: string
  action:
    | 'invite_added'
    | 'invite_removed'
    | 'user_role_changed'
    | 'user_removed'
    | 'first_sign_in'
  actor_user_id: string | null
  target_email: string | null
  target_user_id: string | null
  previous_role: string | null
  new_role: string | null
  notes: string | null
  created_at: string
  actor: { id: string; email: string; display_name: string | null } | null
}
```

- [ ] **Step 2: Update layout to read + pass role**

`voiceagent/dashboard/src/app/(app)/layout.tsx`:

```tsx
import { getCurrentUserRole } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { UserMenu } from '@/components/user-menu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/login')
  if (ctx.role === 'pending') redirect('/not-authorized')

  return (
    <div className="flex h-screen bg-background">
      <Sidebar role={ctx.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b px-6 flex items-center justify-end shrink-0">
          <UserMenu email={ctx.email} />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update Sidebar to accept role prop + conditionally render Master Control**

Modify `voiceagent/dashboard/src/components/sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Settings2, Mic, FlaskConical, Phone, Calendar, DollarSign, Cog, Shield,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

type Tab = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }

const tabs: Tab[] = [
  { href: '/master', label: 'Master Control', icon: Shield, adminOnly: true },
  { href: '/', label: 'Home', icon: Home },
  { href: '/admin', label: 'Prompt Editor', icon: Settings2 },
  { href: '/test', label: 'Browser Test', icon: Mic },
  { href: '/evals', label: 'Evals', icon: FlaskConical },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/costs', label: 'Costs', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Cog },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const visibleTabs = tabs.filter((t) => !t.adminOnly || role === 'admin')

  return (
    <aside className="w-56 shrink-0 border-r bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="p-5 border-b border-zinc-800">
        <div className="text-lg font-semibold tracking-tight">MediCall</div>
        <div className="text-[11px] text-zinc-400 mt-0.5">Pilot dashboard</div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visibleTabs.map(({ href, label, icon: Icon, adminOnly }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? adminOnly
                    ? 'bg-amber-900/40 text-amber-200'
                    : 'bg-zinc-800 text-white'
                  : adminOnly
                    ? 'text-amber-400/80 hover:bg-amber-900/30 hover:text-amber-200'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 text-[11px] text-zinc-500 border-t border-zinc-800">
        v0.3.0-pilot · {role}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Write the Master Control page** (the big one)

Create `voiceagent/dashboard/src/app/(app)/master/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Shield, Trash2, UserPlus, History } from 'lucide-react'
import type { MemberRow, PendingInvite, AuditLogEntry, UserRole } from '@/lib/types'

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-amber-600 text-white',
  editor: 'bg-blue-600 text-white',
  viewer: 'bg-zinc-500 text-white',
  pending: 'bg-zinc-700 text-zinc-300',
}

const ACTION_BADGE: Record<AuditLogEntry['action'], string> = {
  invite_added: 'bg-blue-600 text-white',
  invite_removed: 'bg-amber-600 text-white',
  user_role_changed: 'bg-purple-600 text-white',
  user_removed: 'bg-red-700 text-white',
  first_sign_in: 'bg-emerald-600 text-white',
}

export default function MasterControlPage() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [audit, setAudit] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [inviteNotes, setInviteNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<MemberRow | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [m, i, a] = await Promise.all([
        fetch('/api/master/users').then((r) => r.json()),
        fetch('/api/master/invites').then((r) => r.json()),
        fetch('/api/master/audit').then((r) => r.json()),
      ])
      setMembers(Array.isArray(m) ? m : [])
      setInvites(Array.isArray(i) ? i : [])
      setAudit(Array.isArray(a) ? a : [])
    } catch (e) {
      toast.error(`Load failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/master/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          notes: inviteNotes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'invite failed')
      }
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteNotes('')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setSubmitting(false)
    }
  }

  const cancelInvite = async (id: string) => {
    try {
      const res = await fetch(`/api/master/invites/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'cancel failed')
      }
      toast.success('Invite canceled')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const changeRole = async (userId: string, newRole: 'admin' | 'editor' | 'viewer') => {
    try {
      const res = await fetch(`/api/master/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'role change failed')
      }
      toast.success(`Role updated to ${newRole}`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Role change failed')
    }
  }

  const removeMember = async () => {
    if (!confirmRemove) return
    try {
      const res = await fetch(`/api/master/users/${confirmRemove.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'remove failed')
      }
      toast.success(`Removed ${confirmRemove.email}`)
      setConfirmRemove(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  const adminCount = members.filter((m) => m.role === 'admin').length

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Shield size={20} className="text-amber-500" />
        <h1 className="text-2xl font-semibold">Master Control</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Invite teammates, manage roles, and review the change log.
        Admins can promote others to admin — at least one admin must always exist.
      </p>

      {/* Section A: Team members */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Team members ({members.length})
          </h2>
          <span className="text-xs text-muted-foreground">
            {adminCount} admin{adminCount === 1 ? '' : 's'}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited by</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">Loading…</TableCell></TableRow>
            ) : members.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">No members yet.</TableCell></TableRow>
            ) : members.map((m) => {
              const isLastAdmin = m.role === 'admin' && adminCount <= 1
              const locked = m.is_master || isLastAdmin
              const lockReason = m.is_master
                ? 'Master admin — only modifiable via SQL Editor'
                : isLastAdmin
                  ? 'Last admin — promote someone first'
                  : ''
              return (
                <TableRow key={m.id}>
                  <TableCell>{m.display_name ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{m.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole(m.id, v as 'admin' | 'editor' | 'viewer')}
                        disabled={locked}
                      >
                        <SelectTrigger className="w-28 h-7">
                          <SelectValue>
                            <Badge className={ROLE_BADGE[m.role]}>{m.role}</Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="editor">editor</SelectItem>
                          <SelectItem value="viewer">viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      {m.is_master && (
                        <Badge className="bg-purple-700 text-white text-[10px] uppercase tracking-wide">
                          Master
                        </Badge>
                      )}
                    </div>
                    {lockReason && (
                      <p className="text-[10px] text-muted-foreground mt-1">{lockReason}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.invited_by?.email ?? '— (seed)'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(m)}
                      disabled={locked}
                      title={locked ? lockReason : 'Remove member'}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Section B: Pending invites */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending invites ({invites.length})
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">No pending invites.</TableCell></TableRow>
            ) : invites.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.email}</TableCell>
                <TableCell><Badge className={ROLE_BADGE[inv.role]}>{inv.role}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(inv.invited_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => cancelInvite(inv.id)}>
                    <Trash2 size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Section C: Invite form */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Invite a teammate
        </h2>
        <form onSubmit={submitInvite} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-medium">Email</label>
            <Input
              type="email"
              required
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Role</label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'editor' | 'viewer')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="editor">editor</SelectItem>
                <SelectItem value="viewer">viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={submitting}>
            <UserPlus size={14} className="mr-2" />
            {submitting ? 'Inviting…' : 'Send invite'}
          </Button>
          <div className="md:col-span-4 space-y-1">
            <label className="text-xs font-medium">Notes (optional)</label>
            <Input
              placeholder="e.g., founder, PM, design lead"
              value={inviteNotes}
              onChange={(e) => setInviteNotes(e.target.value)}
            />
          </div>
        </form>
      </Card>

      {/* Section D: Audit log */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-2 flex items-center gap-2">
          <History size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Audit log
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">No actions yet.</TableCell></TableRow>
            ) : audit.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge className={ACTION_BADGE[e.action]}>{e.action}</Badge></TableCell>
                <TableCell className="text-xs">{e.actor?.email ?? 'system'}</TableCell>
                <TableCell className="text-xs">{e.target_email ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {e.previous_role && e.new_role
                    ? `${e.previous_role} → ${e.new_role}`
                    : e.new_role
                      ? `set to ${e.new_role}`
                      : e.notes ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Confirm remove dialog */}
      <Dialog open={confirmRemove !== null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
            <DialogDescription>
              {confirmRemove?.email} will lose access immediately. They&apos;ll need a new invite to return.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>Cancel</Button>
            <Button variant="destructive" onClick={removeMember}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 5: Smoke test in the deployed Railway dashboard**

After the next deploy:
1. Visit `/master` as Shubh (admin) → all 4 sections render
2. Send a test invite to a Gmail you can sign in with → row appears in Pending
3. Sign in with that Gmail in incognito → lands at /home with the assigned role
4. Back in Shubh's session: row moves to Members, audit log shows entries

---

### Task B10: Wrap existing editing API routes with requireRole

**Files:**
- Modify: 5 existing routes (one wrap each)

For each route, replace the existing inline `getUser` check with `requireRole`.

- [ ] **Step 1: `dashboard/src/app/api/prompts/route.ts` — POST**

Locate the `export async function POST(req: Request)`. Replace the user-check block:

```typescript
// BEFORE:
// const { data: { user } } = await supabase.auth.getUser()
// if (!user) { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

// AFTER:
const auth = await requireRole('admin', 'editor')
if (!auth.ok) return auth.response
```

Add the import at the top:
```typescript
import { requireRole } from '@/lib/auth'
```

Wherever `user.id` was used (e.g., for `created_by`), replace with `auth.userId`.

GET stays open to any authenticated user (read-only). Only check `getUser` for GET.

- [ ] **Step 2: `dashboard/src/app/api/parents/route.ts` — POST**

Same pattern. GET stays open.

- [ ] **Step 3: `dashboard/src/app/api/parents/[id]/route.ts` — PATCH + DELETE**

Both methods wrap with `requireRole('admin', 'editor')`.

- [ ] **Step 4: `dashboard/src/app/api/eval/trigger/route.ts` — POST**

Wrap with `requireRole('admin', 'editor')`.

- [ ] **Step 5: `dashboard/src/app/api/livekit-token/route.ts` — GET**

This issues tokens that let the browser PLACE A CALL — restrict to editor+admin:
```typescript
const auth = await requireRole('admin', 'editor')
if (!auth.ok) return auth.response
```

- [ ] **Step 6: Verify GET endpoints still accept viewer**

`/api/calls`, `/api/prompts` (GET), `/api/parents` (GET), `/api/eval/results` — these should remain readable by any authenticated user (no role gate beyond auth). Leave them unchanged.

---

### Task B11: Disable editing UI in existing tabs for viewer

**Files:**
- Create: `voiceagent/dashboard/src/components/role-gate.tsx`
- Modify: 5 existing pages

- [ ] **Step 1: Create RoleGate helper**

`voiceagent/dashboard/src/components/role-gate.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { UserRole } from '@/lib/types'

let cachedRole: UserRole | null = null

export function useCurrentRole(): UserRole | null {
  const [role, setRole] = useState<UserRole | null>(cachedRole)

  useEffect(() => {
    if (cachedRole) return
    fetch('/api/me').then((r) => r.json()).then((d) => {
      if (d.role) {
        cachedRole = d.role
        setRole(d.role)
      }
    }).catch(() => {})
  }, [])

  return role
}

export const VIEWER_DISABLED_TOOLTIP =
  'Read-only access — ask an admin or editor.'

export function canEdit(role: UserRole | null): boolean {
  return role === 'admin' || role === 'editor'
}
```

- [ ] **Step 2: Add /api/me route to support useCurrentRole**

Create `voiceagent/dashboard/src/app/api/me/route.ts`:

```typescript
import { getCurrentUserRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const ctx = await getCurrentUserRole()
  if (!ctx) return NextResponse.json({ role: null }, { status: 401 })
  return NextResponse.json({ role: ctx.role, email: ctx.email })
}
```

- [ ] **Step 3: Update Admin page (disable Save + textareas for viewer)**

In `dashboard/src/app/(app)/admin/page.tsx`:

Add at top: `import { useCurrentRole, canEdit, VIEWER_DISABLED_TOOLTIP } from '@/components/role-gate'`

Inside `AdminPage()`:
```tsx
const role = useCurrentRole()
const editable = canEdit(role)
```

Wherever the Save button appears, add `disabled={!editable || saving}` and a `title={editable ? undefined : VIEWER_DISABLED_TOOLTIP}` attribute.

Wherever Textarea/Input for prompt fields appear, add `readOnly={!editable}`.

- [ ] **Step 4: Update Schedule page (hide Add form + Delete for viewer)**

In `dashboard/src/app/(app)/schedule/page.tsx`:

```tsx
const role = useCurrentRole()
const editable = canEdit(role)

// Wrap the Add form Card:
{editable && (
  <Card className="p-5">
    {/* existing add form */}
  </Card>
)}

// On the Delete button:
<Button
  variant="ghost"
  size="sm"
  onClick={() => setConfirmDelete(p)}
  disabled={!editable}
  title={editable ? undefined : VIEWER_DISABLED_TOOLTIP}
>
  <Trash2 size={14} />
</Button>
```

- [ ] **Step 5: Update Test page (disable Connect for viewer)**

In `dashboard/src/app/(app)/test/page.tsx`:

```tsx
const role = useCurrentRole()
const editable = canEdit(role)

<Button onClick={connect} disabled={connecting || !editable} title={editable ? undefined : VIEWER_DISABLED_TOOLTIP}>
  <Phone size={14} className="mr-1.5" />
  {connecting ? 'Connecting…' : 'Connect to agent'}
</Button>
```

- [ ] **Step 6: Update Evals page (disable Run goldenset for viewer)**

In `dashboard/src/app/(app)/evals/page.tsx`:

```tsx
const role = useCurrentRole()
const editable = canEdit(role)

<Button onClick={trigger} disabled={triggering || !editable} title={editable ? undefined : VIEWER_DISABLED_TOOLTIP}>
  ...
</Button>
```

- [ ] **Step 7: Update Calls page to render legacy_transcript_text**

In `dashboard/src/app/(app)/calls/page.tsx`, inside the detail Dialog's transcript section:

```tsx
<div>
  <div className="text-xs text-muted-foreground mb-1">Transcript</div>
  <div className="space-y-2 border rounded-md p-3 bg-muted/30">
    {Array.isArray(selected.transcript) && selected.transcript.length > 0 ? (
      selected.transcript.map((m, i) => (
        <div key={i} className="text-sm">
          <span className="text-xs font-semibold uppercase text-muted-foreground mr-2">{m.role}</span>
          {m.text}
        </div>
      ))
    ) : selected.legacy_transcript_text ? (
      <>
        <Badge variant="outline" className="mb-2 text-amber-600 border-amber-600">Legacy excerpt</Badge>
        <p className="text-sm whitespace-pre-wrap">{selected.legacy_transcript_text}</p>
      </>
    ) : (
      <span className="text-xs text-muted-foreground">No transcript.</span>
    )}
  </div>
</div>
```

Also extend the `CallLog` type in `lib/types.ts` with `legacy_transcript_text: string | null`. The webhook API at `/api/calls` already returns `*` so no API changes needed.

- [ ] **Step 8: Smoke test by signing in as a viewer test account**

After Task A1 + B9 ship and you invite a test Gmail as viewer:
1. Sign in with that account
2. Visit /admin → textareas read-only, no Save button
3. Visit /schedule → no Add form, no Delete buttons
4. Visit /test → page renders, Connect button disabled, tooltip works
5. Visit /evals → Run button disabled
6. Visit /master → sidebar item doesn't appear; manually navigating to /master gets a 403 from /api/master/users

---

### Task B12: Sheet migration script

**Files:**
- Create: `voiceagent/scripts/migrate_sheet_to_supabase.py`
- Modify: `voiceagent/.gitignore`

- [ ] **Step 1: Add migration logs to .gitignore**

Append to `voiceagent/.gitignore`:

```
# --- Migration audit logs ---
migrations/*.log
```

- [ ] **Step 2: Write the migration script**

`voiceagent/scripts/migrate_sheet_to_supabase.py`:

```python
"""
Production-grade migration: Google Sheet (medicall-pilot-log) → Supabase.

Spec: voiceagent/docs/2026-06-22-master-control-spec.md §11

Usage:
  Set env vars:
    SUPABASE_DB_URL=<direct port 5432 URL>
    SCHEDULE_CSV_URL=<published CSV URL for schedule tab>
    CALL_LOGS_CSV_URL=<published CSV URL for call_logs tab>
  Optional:
    --dry-run   parse + summarize but write nothing
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
import requests


# ---------- Config ----------
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL")
SCHEDULE_CSV_URL = os.environ.get("SCHEDULE_CSV_URL")
CALL_LOGS_CSV_URL = os.environ.get("CALL_LOGS_CSV_URL")

LOG_DIR = Path(__file__).parent.parent / "migrations"
LOG_DIR.mkdir(exist_ok=True)
LOG_PATH = LOG_DIR / f"{datetime.now().strftime('%Y-%m-%d')}-sheet-import.log"


# ---------- Phone normalization (ports the JS normalizePhone_ from webhook_v2.gs) ----------
def normalize_phone(value: str | None) -> str:
    if not value:
        return ""
    s = re.sub(r"[^\d+]", "", str(value))
    if s.startswith("+"):
        s = s[1:]
    # Add +91 prefix if it looks like an Indian mobile (10 digits starting 6-9)
    if len(s) == 10 and s[0] in "6789":
        s = "91" + s
    return "+" + s if s else ""


# ---------- Outcome map (verbatim from webhook_v2.gs.mapOutcome_) ----------
def map_vapi_outcome(ended_reason: str, summary: str) -> str:
    reason = (ended_reason or "").lower()
    summ = (summary or "").lower()
    if any(k in reason for k in ("silence", "assistant-error", "no-answer", "busy", "failed", "voicemail")):
        return "NO_ANSWER"
    if "customer-ended-call" in reason or "assistant-ended-call" in reason:
        if any(k in summ for k in ("denied", "did not take", "refused", "nahi")):
            return "DENIED"
        return "CONFIRMED"
    if any(k in summ for k in ("confirmed", "took", "haan", "le liya")):
        return "CONFIRMED"
    if any(k in summ for k in ("denied", "nahi")):
        return "DENIED"
    return "NO_ANSWER"


# ---------- Pass 1: structured transcript reconstruction ----------
def reconstruct_transcript(raw_payload: dict[str, Any]) -> list[dict[str, str]] | None:
    """Try to extract full structured turns from the Vapi raw payload.
    Returns a list of {role, text} dicts, or None if nothing usable was found."""
    if not isinstance(raw_payload, dict):
        return None
    # Prefer artifact.messages (Vapi canonical turn array)
    message_obj = raw_payload.get("message") or raw_payload
    artifact = message_obj.get("artifact") or {}
    messages = (
        artifact.get("messages")
        or message_obj.get("messages")
        or []
    )
    if not isinstance(messages, list) or not messages:
        return None

    out: list[dict[str, str]] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role_raw = (m.get("role") or m.get("type") or "").lower()
        # Vapi roles: 'user', 'assistant', 'system', 'tool', 'bot'
        if role_raw in ("system", "tool"):
            continue
        # Normalize to our schema (user / agent)
        if role_raw in ("assistant", "bot"):
            role = "agent"
        elif role_raw == "user":
            role = "user"
        else:
            continue
        text = m.get("message") or m.get("content") or m.get("text") or ""
        if not isinstance(text, str):
            continue
        text = text.strip()
        if not text:
            continue
        out.append({"role": role, "text": text})

    return out if out else None


# ---------- Migration ----------
def fetch_csv(url: str) -> list[dict[str, str]]:
    resp = requests.get(url, timeout=30, allow_redirects=True)
    resp.raise_for_status()
    return list(csv.DictReader(io.StringIO(resp.text)))


def migrate_parents(rows: list[dict[str, str]], conn, dry_run: bool, log: logging.Logger) -> int:
    inserted = 0
    for row in rows:
        name = (row.get("parent_name") or "").strip()
        phone = normalize_phone(row.get("phone"))
        drug = (row.get("drug_name") or "").strip() or "unknown"
        scheduled = (row.get("scheduled_time") or "").strip() or None
        caregiver_email = (row.get("caregiver_email") or "").strip() or None

        if not name or not phone:
            log.warning(f"Parent skipped (missing name/phone): {row}")
            continue
        if drug == "unknown":
            log.warning(f"Parent {name} ({phone}) drug_name defaulted to 'unknown'")

        if dry_run:
            inserted += 1
            continue

        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.parents (name, phone, drug_name, scheduled_time, caregiver_email, active)
                values (%s, %s, %s, %s, %s, true)
                on conflict (phone) do update
                  set name = excluded.name,
                      drug_name = excluded.drug_name,
                      scheduled_time = excluded.scheduled_time,
                      caregiver_email = excluded.caregiver_email
                returning id
                """,
                (name, phone, drug, scheduled, caregiver_email),
            )
            inserted += 1
    return inserted


def migrate_call_logs(rows: list[dict[str, str]], conn, dry_run: bool, log: logging.Logger) -> int:
    inserted = 0
    for row in rows:
        timestamp_str = (row.get("timestamp") or "").strip()
        phone = normalize_phone(row.get("phone"))
        outcome = (row.get("outcome") or "NO_ANSWER").upper()
        excerpt = (row.get("transcript_excerpt") or "").strip()
        duration_str = (row.get("duration_sec") or "0").strip()
        stack = (row.get("stack") or "vapi").lower()
        raw_payload_str = (row.get("raw_payload_json") or "").strip()

        if not phone:
            log.warning(f"call_log skipped (missing phone): {row.get('timestamp')}")
            continue
        if outcome not in ("CONFIRMED", "DENIED", "ESCALATED", "NO_ANSWER", "ERROR"):
            log.warning(f"call_log {timestamp_str}: outcome '{outcome}' coerced to NO_ANSWER")
            outcome = "NO_ANSWER"

        try:
            duration = int(float(duration_str)) if duration_str else 0
        except ValueError:
            duration = 0

        # Parse raw_payload
        raw_payload: dict[str, Any] | None = None
        if raw_payload_str:
            try:
                raw_payload = json.loads(raw_payload_str)
            except json.JSONDecodeError:
                log.warning(f"call_log {timestamp_str}: raw_payload_json unparseable")
                raw_payload = {"_unparseable": raw_payload_str[:4000]}

        # Pass 1: structured reconstruction
        transcript: list[dict[str, str]] | None = None
        legacy_text: str | None = None
        if isinstance(raw_payload, dict) and "_unparseable" not in raw_payload:
            transcript = reconstruct_transcript(raw_payload)
        if transcript is None:
            # Pass 2: legacy excerpt fallback
            legacy_text = excerpt or None

        # Synthetic call_id (deterministic for idempotency)
        call_id: str | None = None
        if isinstance(raw_payload, dict):
            msg = raw_payload.get("message") or raw_payload
            call_obj = msg.get("call") or {}
            call_id = call_obj.get("id") or raw_payload.get("call", {}).get("id")
        if not call_id:
            ts_compact = re.sub(r"[^0-9]", "", timestamp_str)[:14] or "0"
            call_id = f"legacy-vapi-{ts_compact}-{phone[-4:]}"

        # Reason from ended_reason
        reason = None
        if isinstance(raw_payload, dict):
            msg = raw_payload.get("message") or raw_payload
            reason = msg.get("endedReason")

        # Timestamps
        try:
            started_at = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            ended_at = started_at  # approximate — duration adds happen at DB tier via interval if we need
        except Exception:
            started_at = datetime.now(timezone.utc)
            ended_at = started_at

        if dry_run:
            inserted += 1
            continue

        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.call_logs (
                  call_id, phone, outcome, outcome_source, reason,
                  transcript, legacy_transcript_text, duration_sec,
                  prompt_version, stack, raw_payload, langfuse_trace_id,
                  started_at, ended_at
                ) values (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
                on conflict (call_id) do nothing
                """,
                (
                    call_id, phone, outcome, "keyword_match", reason,
                    json.dumps(transcript) if transcript else None,
                    legacy_text, duration,
                    None, stack,
                    json.dumps(raw_payload) if raw_payload else None,
                    None,
                    started_at, ended_at,
                ),
            )
            inserted += 1
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(description="Sheet → Supabase migration")
    parser.add_argument("--dry-run", action="store_true", help="Parse + summarize without writing")
    args = parser.parse_args()

    # Logging
    log = logging.getLogger("migrate")
    log.setLevel(logging.INFO)
    fh = logging.FileHandler(LOG_PATH, mode="w", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(fh)
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    log.addHandler(ch)

    if args.dry_run:
        log.info("=" * 60)
        log.info("DRY RUN — no writes will be made")
        log.info("=" * 60)

    # Env checks
    for var in ("SCHEDULE_CSV_URL", "CALL_LOGS_CSV_URL"):
        if not os.environ.get(var):
            log.error(f"{var} env var required")
            return 1
    if not args.dry_run and not SUPABASE_DB_URL:
        log.error("SUPABASE_DB_URL env var required for real run")
        return 1

    log.info(f"Fetching schedule CSV...")
    schedule_rows = fetch_csv(SCHEDULE_CSV_URL)
    log.info(f"  → {len(schedule_rows)} rows")

    log.info(f"Fetching call_logs CSV...")
    call_log_rows = fetch_csv(CALL_LOGS_CSV_URL)
    log.info(f"  → {len(call_log_rows)} rows")

    conn = None
    if not args.dry_run:
        conn = psycopg2.connect(SUPABASE_DB_URL)
        conn.autocommit = False

    try:
        log.info("Migrating parents...")
        parents_n = migrate_parents(schedule_rows, conn, args.dry_run, log)
        log.info(f"  → {parents_n} parents")

        log.info("Migrating call_logs...")
        calls_n = migrate_call_logs(call_log_rows, conn, args.dry_run, log)
        log.info(f"  → {calls_n} call_logs")

        if conn:
            conn.commit()
            log.info("COMMITTED")
        log.info("=" * 60)
        log.info(f"MIGRATION {'DRY-RUN' if args.dry_run else 'COMPLETE'}")
        log.info(f"  parents:   {parents_n}")
        log.info(f"  call_logs: {calls_n}")
        log.info(f"  log file:  {LOG_PATH}")
        log.info("=" * 60)
        return 0
    except Exception as e:
        log.error(f"Migration failed: {e}")
        if conn:
            conn.rollback()
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Add requirements**

If `voiceagent/scripts/requirements.txt` doesn't exist, create:
```
requests>=2.31
psycopg2-binary>=2.9
```

- [ ] **Step 4: Self-test (with --dry-run if possible)**

The user does the dry-run in Task A2. Don't run real migration from the subagent.

---

### Task B13: Batch commit + push

**Files:** none — git operations only

- [ ] **Step 1: Stage everything**

```bash
cd "C:\Users\SHUBH SANKALP DAS\Desktop\Building\voiceagent"
git add supabase/migrations/002_master_control.sql
git add dashboard/src/lib/auth.ts
git add dashboard/src/lib/types.ts
git add dashboard/src/middleware.ts
git add dashboard/src/app/not-authorized/
git add dashboard/src/app/api/master/
git add dashboard/src/app/api/me/
git add dashboard/src/app/api/prompts/
git add dashboard/src/app/api/parents/
git add dashboard/src/app/api/eval/
git add dashboard/src/app/api/livekit-token/
git add dashboard/src/app/\(app\)/
git add dashboard/src/components/sidebar.tsx
git add dashboard/src/components/role-gate.tsx
git add scripts/migrate_sheet_to_supabase.py
git add scripts/requirements.txt
git add .gitignore
```

- [ ] **Step 2: Verify nothing sensitive is staged**

```bash
git status
```

Look for credentials, .env files, anything in node_modules — expected: zero.

- [ ] **Step 3: Commit + push**

```bash
git commit -m "feat: master control, role enforcement, sheet migration

- Migration 002: allowed_emails + audit_log tables, legacy_transcript_text
  column, allowlist-aware handle_new_user trigger
- Auth: requireRole helper, getCurrentUserRole, 3-tier (admin/editor/viewer/pending)
- Middleware: redirects pending users to /not-authorized
- Master Control UI: members, pending invites, invite form, audit log
- Sidebar: conditionally renders Master Control row for admins
- Role enforcement: API + UI defense in depth on all editing endpoints
- /calls: renders legacy_transcript_text with badge when transcript jsonb is null
- Migration script: production-grade two-pass transcript reconstruction,
  --dry-run mode, idempotent via call_id upsert"

git push
```

Railway will auto-rebuild `next-app` within ~30 seconds of push.

---

## Self-Review

**Spec coverage:**
- §3 role matrix → Task B10 (API) + B11 (UI)
- §4 sign-in flow → Task B1 (trigger) + B3 (middleware) + B4 (/not-authorized)
- §5 schema → Task B1
- §6 API surface → Tasks B5-B8 (master/*), B10 (existing routes wrapped), B11 (/api/me added)
- §7.1 sidebar visibility → Task B9 Step 3
- §7.2 Master Control page → Task B9 Step 4
- §7.3 role enforcement → Task B11
- §7.4 /not-authorized → Task B4
- §8 version history (already done) → no new task
- §11 Sheet migration → Task B12 + A2

**Placeholder scan:** No TBDs or "implement later". All code blocks runnable. Two `// existing add form` style placeholders in Task B11 step 4 reference the existing markup the subagent will see when it reads the file — not actual placeholders for absent code.

**Type consistency:** `UserRole` defined once in `lib/types.ts`, imported everywhere. `requireRole` signature matches across all 6 API consumers. `MemberRow`, `PendingInvite`, `AuditLogEntry` shapes consistent between API responses and UI consumers. `useCurrentRole()` returns `UserRole | null` consistently.

**Cross-references:**
- Task B5-B8 use `requireRole` from Task B2 ✓
- Task B9 imports types defined in B9 Step 1 + uses APIs from B5-B8 ✓
- Task B11 imports `useCurrentRole` from B11 Step 1 + uses /api/me from B11 Step 2 ✓
- Task B12 references `legacy_transcript_text` column added in B1 ✓

---

## Execution Handoff

Plan complete and saved to `voiceagent/docs/2026-06-22-master-control-plan.md`.

**Tasks to execute (in order, subagent-driven):**

1. **B1** — SQL migration file (no DB writes, just the file)
2. **A1** — Human applies the SQL in Supabase Editor (~30 sec)
3. **B2** — `requireRole` helper + `getCurrentUserRole`
4. **B3** — middleware update for pending-user gate
5. **B4** — `/not-authorized` page
6. **B5** — GET /api/master/users
7. **B6** — invites routes (POST + GET + DELETE)
8. **B7** — users/[id] PATCH + DELETE with last-admin guard
9. **B8** — GET /api/master/audit
10. **B9** — Master Control UI + sidebar update + types
11. **B10** — wrap 5 existing editing API routes with requireRole
12. **B11** — disable editing UI in existing tabs for viewer + /api/me
13. **B12** — Python migration script
14. **A2** — Human runs migration (dry-run, then real)
15. **B13** — batch commit + push
16. **Acceptance pass** — controller walks the 21 criteria from spec §10 against the deployed dashboard

**Total agent subtasks:** 12 (B1-B12, plus B13 commit step)
**Total human steps:** 2 (A1 schema apply, A2 migration run)
**Estimated wall-clock:** ~45 min of subagent execution + ~5 min of human steps.
