# Master Control — Design Spec (Phase 0 feature B26)

**Date:** 2026-06-22
**Status:** Drafted, awaiting Shubh approval
**Supersedes:** none (greenfield feature)
**Companion:** [PRD-TRD.md](../PRD-TRD.md), [IMPLEMENTATION-PLAN.md](../IMPLEMENTATION-PLAN.md)

---

## 1. Goal

Turn the MediCall dashboard from a single-user prototype into a shared team workspace with controlled access. Anyone on the team sees the same data; admins control who can sign in and what they can do.

Three problems this solves:

1. **Open dashboard** — today anyone who reaches the URL and has a Google account can sign in. Teammates need invite-only access.
2. **Flat permissions** — once signed in, every user can edit anything. Need tiered access for caregivers, ops, founders.
3. **No audit trail** — can't see who edited what prompt, who invited whom, when roles changed. Important before scaling beyond 3-5 users.

---

## 2. User stories

| As a | I want to | So that |
|---|---|---|
| **Founder (admin)** | Invite a teammate by email with a chosen role | They can sign in and start contributing without manual SQL |
| **Founder (admin)** | Promote another teammate to admin | The org doesn't have a single point of failure |
| **Founder (admin)** | Demote or remove a teammate | A departed teammate can't keep accessing pilot data |
| **Editor (PM/ops)** | Edit prompts, manage parents, run evals | I can do real work without bothering an admin |
| **Editor** | NOT see Master Control | The team-management UI doesn't clutter my view |
| **Viewer (caregiver, observer)** | See call logs, current prompt, eval results | I'm informed but can't accidentally break things |
| **Anyone (uninvited)** | Get a clear "Not authorized" message if I try to sign in | I know to ask Shubh for access instead of refreshing in confusion |
| **Any signed-in user** | See who last edited the active prompt | I know who to ask if a change broke something |

---

## 3. Three-tier role model

| Role | Master Control | Edit prompts | Manage parents | Run evals | Place test calls | View calls | View prompts/evals |
|---|---|---|---|---|---|---|---|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **editor** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **viewer** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| (no role / pending) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (gets Not Authorized page) |

Multiple admins allowed. The system enforces: **at least one admin must always exist.** Attempts to demote or remove the last admin are blocked with a clear error.

---

## 4. Strict allowlist sign-in flow

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Continue with Google" on /login                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
       ┌────────────────────────────────────────┐
       │ Google OAuth completes, Supabase Auth │
       │ creates auth.users row                │
       └────────────────────┬───────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ Trigger handle_new_user fires on auth.users insert         │
│                                                             │
│ Check: is new.email in allowed_emails table?               │
│                                                             │
│   YES → Create public.users row with role from             │
│         allowed_emails.role. Mark allowed_emails.consumed. │
│                                                             │
│   NO  → Create public.users row with role='pending'        │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ Middleware reads public.users.role                       │
│                                                           │
│   pending  → redirect to /not-authorized                 │
│   viewer   → allow access, hide editing UI               │
│   editor   → allow access + editing                      │
│   admin    → allow access + Master Control               │
└───────────────────────────────────────────────────────────┘
```

---

## 5. Schema changes

### 5.1 New table: `allowed_emails`

The invite list. Admin adds rows here BEFORE the person signs in.

```sql
create table public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid references public.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  consumed_at timestamptz,                         -- set when the user actually signs in
  consumed_user_id uuid references public.users(id) on delete set null
);

create index allowed_emails_email_idx on allowed_emails (lower(email));
```

### 5.2 New table: `audit_log`

Append-only history of permission-changing actions.

```sql
create type audit_action as enum (
  'invite_added',         -- new row in allowed_emails
  'invite_removed',       -- row deleted from allowed_emails before consumption
  'user_role_changed',    -- public.users.role updated
  'user_removed',         -- public.users row deleted (+ auth.users cascade)
  'first_sign_in'         -- a user consumed their invite
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action audit_action not null,
  actor_user_id uuid references public.users(id) on delete set null,  -- who did it (null = system)
  target_email text,                                                  -- email affected
  target_user_id uuid references public.users(id) on delete set null, -- user affected (if exists)
  previous_role text,
  new_role text,
  notes text,
  created_at timestamptz not null default now()
);

create index audit_log_target_user_idx on audit_log (target_user_id, created_at desc);
create index audit_log_created_at_idx on audit_log (created_at desc);
```

### 5.3 Update `handle_new_user` trigger

Replace the current logic (which always sets role='viewer') with allowlist-aware logic:

```sql
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
  -- Look up invite by email (case-insensitive)
  select id, role into invite_record
  from public.allowed_emails
  where lower(email) = lower(new.email)
    and consumed_at is null
  limit 1;

  if found then
    assigned_role := invite_record.role;
    -- Consume the invite
    update public.allowed_emails
    set consumed_at = now(),
        consumed_user_id = new.id
    where id = invite_record.id;
  else
    assigned_role := 'pending';   -- not invited → blocked at app layer
  end if;

  insert into public.users (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    assigned_role
  )
  on conflict (id) do nothing;

  -- Audit: first sign-in
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
```

### 5.4 Seed Shubh as admin

Backfill so dasshriyans2802@gmail.com (the only user so far) becomes admin AND there's a seed entry in `allowed_emails`.

```sql
-- Promote existing user (already done in earlier session, idempotent)
update public.users set role = 'admin' where email = 'dasshriyans2802@gmail.com';

-- Record the seed admin in allowed_emails (for visibility in Master Control UI)
insert into public.allowed_emails (email, role, consumed_at, consumed_user_id)
select 'dasshriyans2802@gmail.com', 'admin', now(), id
from public.users where email = 'dasshriyans2802@gmail.com'
on conflict (email) do nothing;
```

---

## 6. API surface

### 6.1 New routes

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/master/users` | admin only | List all users + their role + last_sign_in_at + invite metadata |
| POST | `/api/master/invites` | admin only | Add email to allowed_emails. Body: `{ email, role, notes? }`. Inserts audit row `invite_added`. |
| DELETE | `/api/master/invites/[id]` | admin only | Remove an UNCONSUMED invite. Inserts audit row `invite_removed`. |
| PATCH | `/api/master/users/[id]` | admin only | Change a user's role. Body: `{ role }`. Inserts audit row `user_role_changed`. Blocks demoting last admin. |
| DELETE | `/api/master/users/[id]` | admin only | Remove a user entirely (deletes from public.users + cascades auth.users). Inserts audit row `user_removed`. Blocks removing last admin. |
| GET | `/api/master/audit` | admin only | Last 100 audit_log entries, joined with actor display_name |

### 6.2 Middleware extension

Current middleware checks `if (!user) → redirect /login`. Add:

```typescript
const { data: profile } = await supabase
  .from('users')
  .select('role')
  .eq('id', user.id)
  .maybeSingle()

if (profile?.role === 'pending') {
  return NextResponse.redirect(new URL('/not-authorized', request.url))
}

// Pass role into request headers so server components can read without re-querying
response.headers.set('x-user-role', profile?.role ?? 'pending')
```

Master Control admin guard: every `/api/master/*` route does:

```typescript
const { data: profile } = await supabase
  .from('users').select('role').eq('id', user.id).maybeSingle()
if (profile?.role !== 'admin') {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}
```

---

## 7. UI surface

### 7.1 Sidebar visibility

`Sidebar` component reads role (passed from layout via prop or context). Master Control tab renders ONLY when `role === 'admin'`. Position: **above Home** per user spec, with a distinct visual treatment (e.g., subtle accent color or shield icon).

```
┌─────────────────┐
│ MediCall        │
│ Pilot dashboard │
├─────────────────┤
│ 🛡️ Master Control │  ← admin only
│ 🏠 Home          │
│ ⚙️ Admin         │  ← editor + admin
│ 🎤 Browser Test │
│ 🧪 Evals         │
│ 📞 Calls         │
│ 📅 Schedule      │
│ 💵 Costs         │
│ ⚙️ Settings      │
└─────────────────┘
```

### 7.2 Master Control page sections

Single page at `/master`, three Card-based sections vertically stacked:

**A. Team members table**
- Columns: Name, Email, Role (badge), Last sign-in, Invited by, Actions
- Actions per row: change role (dropdown), remove (trash icon)
- Last-admin safety: if you try to demote/remove yourself AND you're the only admin, the action button is disabled with a tooltip "You're the only admin — promote someone else first"

**B. Pending invites table**
- Rows from `allowed_emails` where `consumed_at IS NULL`
- Columns: Email, Role, Invited by, Invited at, Cancel button
- Empty state: "No pending invites"

**C. Invite form**
- Email input, role dropdown (admin/editor/viewer), optional notes
- Submit → POST `/api/master/invites` → row appears in B + audit log

**D. Audit log table** (paginated, 50 per page)
- Columns: When, Action (chip), Actor, Target, Notes
- Actions render with semantic colors (invite=blue, remove=amber, role_change=purple)
- Click row → expand to show full notes
- Empty state: "No actions yet"

### 7.3 Editing access enforcement in existing tabs

Editor and admin roles see the existing UI unchanged. Viewer role sees:
- `/admin` (prompts): readonly textareas, no Save button, version history panel remains visible (read-only click-to-view)
- `/schedule`: table only, no Add form, no Delete buttons
- `/calls`, `/evals`, `/costs`: unchanged (already read-only)
- `/test`: page renders normally with title, description, status indicators. The **Connect to agent** button is rendered but disabled, with a tooltip on hover: *"Read-only access — ask an admin or editor to place test calls."* The Evals trigger button uses the same disabled-with-tooltip pattern.
- `/settings`: shows their own user info but no integration controls or rotation buttons

The disable-with-tooltip pattern (vs hide-entirely) means viewers can SEE what features exist, learn the UI, and ask informed questions of admins — rather than being confused about what's missing.

API routes also enforce role at the server layer (defense in depth):

```typescript
// Helper used by all editing routes
async function requireRole(supabase, ...allowed: string[]): Promise<{ user, role } | NextResponse> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || !allowed.includes(profile.role)) {
    return NextResponse.json({ error: 'forbidden — requires ' + allowed.join(' or ') }, { status: 403 })
  }
  return { user, role: profile.role }
}
```

### 7.4 `/not-authorized` page

Public route (in middleware PUBLIC_PATHS). Shows:
- Friendly message: "Hi {email} — your account isn't on the MediCall AI access list yet."
- Action: "Contact dasshriyans2802@gmail.com to request access"
- Sign-out button (so they can switch Google accounts)

---

## 8. Version history "last edited by" — already wired

B25 (just shipped) joins `prompts.created_by → users` and renders `display_name` (falls back to email). After Master Control lands, this will naturally show the team member who edited each version. **No changes needed to B25.**

---

## 9. Out of scope (deferred to Phase A)

| Item | Why deferred |
|---|---|
| Magic-link invites (email sent on invite_added) | Requires email-sending infrastructure (Resend / SES). Phase A. |
| Per-row Supabase RLS (row-level filtering by role) | All current tables are org-level (single-tenant). Phase A when caregivers see only their parent's calls. |
| Org-tenant model (separate workspaces per hospital) | Phase B / commercialization. |
| SSO with hospital identity providers (SAML/OIDC) | Phase C. |
| Granular permissions (e.g., "can edit prompts but NOT delete parents") | Three-tier role is sufficient for pilot team. |
| Soft-delete / undo of user removal | Phase A — for now removed = gone, recreate by re-inviting. |

---

## 10. Acceptance criteria

These are the **testable scenarios** I'll click through to verify the feature is done. Each row is a concrete pass/fail check:

### Master Control core

1. ✅ Logging in with `dasshriyans2802@gmail.com` shows **Master Control** above Home in the sidebar.
2. ✅ Logging in with a fresh Google account NOT in `allowed_emails` → lands on `/not-authorized` with friendly message + sign-out button.
3. ✅ Admin adds email + role via Master Control → that person signs in → lands in dashboard with the assigned role (verified via the role badge in /settings).
4. ✅ Admin demotes another admin to editor → works, audit log entry appears.
5. ✅ Admin tries to demote the ONLY remaining admin → blocked with error "You're the only admin — promote someone else first." No DB change.
6. ✅ Admin tries to remove the ONLY remaining admin → same block.
7. ✅ Admin removes an editor → editor immediately bounced to `/not-authorized` on next page load (within 1 page navigation).

### Role enforcement in existing tabs

8. ✅ Viewer signs in → `/admin` shows prompt v1 in read-only textareas, no Save button, version history panel still visible (read-only).
9. ✅ Viewer signs in → `/schedule` shows the parents table, no Add form, no Delete buttons.
10. ✅ Viewer signs in → `/test` renders normally with title + status indicators; **Connect to agent** button is rendered but disabled; hover shows tooltip "Read-only access — ask an admin or editor to place test calls."
11. ✅ Viewer signs in → `/evals` shows past run history; **Run goldenset** button disabled with same tooltip pattern.
12. ✅ Editor signs in → all of the above are ENABLED. Editor does NOT see Master Control in sidebar.
13. ✅ Editor tries to hit `POST /api/master/invites` directly via curl with their session cookie → 403 forbidden (API-layer defense in depth).

### Audit + version history

14. ✅ Every invite/remove/role-change appears in the Audit log card within 1 second of the action.
15. ✅ Audit log shows actor display_name + target email + action chip + timestamp.
16. ✅ Version history in `/admin` shows the email/display_name of whoever saved each prompt version (already works post-B25; this spec adds the auth model behind it).

### Migration (B21)

17. ✅ `--dry-run` mode prints a summary without writing anything.
18. ✅ Real run inserts the expected number of `parents` and `call_logs` rows. Migration log file shows zero errors (or only documented skip reasons).
19. ✅ A migrated `call_logs` row with valid `raw_payload_json` has a FULL structured `transcript` jsonb (multiple turns), NOT the 500-char excerpt.
20. ✅ A migrated row with malformed `raw_payload_json` has `transcript` = NULL and `legacy_transcript_text` populated with the excerpt; `/calls` Dialog shows the excerpt with a "Legacy excerpt" badge.
21. ✅ Re-running the migration script → 0 new rows inserted, no errors (idempotent via upsert-on-call_id and upsert-on-phone).

### How acceptance is checked

I'll go through #1-21 one at a time after the build completes. Any that fails → I dispatch a fix subagent. Once all 21 are ✅ → feature ships.

---

## 11. Companion task: Google Sheet migration (B21) — production-grade

Separate from Master Control but bundled into the same dispatch. **Production-grade approach — no shortcuts on transcript fidelity.**

### 11.1 Sources

- Sheet: `medicall-pilot-log`
- Tab `schedule` (gid=0) — Sheet columns derived from `webhook_v2.gs` constants:
  - Column A: `parent_name`
  - Column B: `phone`
  - Additional columns (if present): `drug_name`, `scheduled_time`, `caregiver_email` — migrate when found, leave null when absent
- Tab `call_logs` (gid=46029314) — v2 schema:
  - `timestamp | parent_name | phone | outcome | transcript_excerpt | duration_sec | stack | raw_payload_json`

### 11.2 Schema addition (one new column)

To honestly represent the legacy transcript data without forcing it into our new structured shape, add one nullable column to `call_logs`:

```sql
alter table public.call_logs
  add column if not exists legacy_transcript_text text;

comment on column public.call_logs.legacy_transcript_text is
  'Free-text transcript excerpt from pre-Supabase Vapi/Apps-Script era. Set only on rows migrated from the Google Sheet. New rows use the structured transcript jsonb instead.';
```

This goes in migration `002_add_legacy_transcript_text.sql`.

### 11.3 Two-pass transcript reconstruction strategy

For each `call_logs` row from the Sheet, the migration tries to give us the BEST possible transcript representation, in this order:

**Pass 1 — Structured reconstruction from `raw_payload_json`** (preferred, lossless)

The original Vapi webhook payload stored full structured turns in `raw_payload_json`. Extract them:

- Try `payload.message.artifact.messages` (Vapi's canonical turn array)
- Fallback: `payload.message.messages`
- Each turn has `role` (`user`/`assistant`/`tool`/`system`) + `message`/`content`/`text`
- Normalize to our schema: `[{role: "user"|"agent", text: "..."}]` (map `assistant` → `agent`, drop `system`/`tool` turns since they're internal)
- Write to `call_logs.transcript` (jsonb)
- Leave `legacy_transcript_text` NULL

This restores the **full** structured conversation, not the 500-char excerpt. The excerpt was a Sheet-display optimization; the real data was always in `raw_payload_json`.

**Pass 2 — Excerpt fallback** (when raw_payload is missing or unparseable)

Some legacy rows may have malformed or missing `raw_payload_json`. For those:
- `call_logs.transcript` → NULL (honest: we don't have structured data)
- `call_logs.legacy_transcript_text` → the `transcript_excerpt` string verbatim

The dashboard's `/calls` Dialog already handles `transcript === null` ("No transcript"). We'll also wire it to show `legacy_transcript_text` (with a "Legacy excerpt" badge) when transcript jsonb is null but legacy text exists — so admins viewing old rows see something useful, with clear labeling that it's a partial excerpt, not a complete transcript.

### 11.4 Field mapping for `call_logs` (full table)

| Sheet column | Supabase column | Transform |
|---|---|---|
| `timestamp` | `created_at` AND `started_at` AND `ended_at` | Parsed as ISO; `ended_at` = `started_at + duration_sec` |
| `parent_name` | (used for `parent_id` lookup, not stored) | Lookup in `parents` table by phone; if no match, parent_id stays NULL |
| `phone` | `phone` | Normalized to E.164 (Apps Script `normalizePhone_` ported to Python) |
| `outcome` | `outcome` | Verbatim (Vapi values CONFIRMED/DENIED/NO_ANSWER all exist in our enum) |
| `transcript_excerpt` | (see §11.3) | Pass 1 (structured from raw_payload) OR Pass 2 (legacy_transcript_text) |
| `duration_sec` | `duration_sec` | Integer cast |
| `stack` | `stack` | Verbatim ('vapi' for all migrated rows) |
| `raw_payload_json` | `raw_payload` | Parsed as JSON; stored as jsonb. If unparseable → store as `{"_unparseable": "<raw string>"}` so we never lose the bytes. |
| (synthetic) | `outcome_source` | Set to `'keyword_match'` for ALL migrated rows (honest — Vapi used heuristic outcome mapping per `mapOutcome_` in webhook_v2.gs) |
| (synthetic) | `prompt_version` | NULL (no version tracking existed pre-Supabase) |
| (synthetic) | `call_id` | Extracted from `raw_payload.message.call.id` OR `raw_payload.call.id`; fallback `"legacy-vapi-{timestamp}-{phone_last4}"` (deterministic for idempotency) |
| (synthetic) | `langfuse_trace_id` | NULL (Vapi calls predate Langfuse integration) |
| (synthetic) | `reason` | Extracted from `raw_payload.message.endedReason` if present, else NULL |

### 11.5 Field mapping for `parents`

| Sheet column | Supabase column | Transform |
|---|---|---|
| `parent_name` | `name` | Trimmed |
| `phone` | `phone` | E.164 normalized — UNIQUE constraint already exists, upsert on conflict |
| `drug_name` | `drug_name` | Required by our schema. If Sheet column missing, default to `'unknown'` and emit a warning row to migration log. |
| `scheduled_time` | `scheduled_time` | Parsed as time; NULL if absent |
| `caregiver_email` | `caregiver_email` | NULL if absent |
| (synthetic) | `active` | `true` for all migrated parents |
| (synthetic) | `created_at` | `now()` (the row didn't exist in Supabase before, so its creation time IS the migration time) |

### 11.6 Idempotency + safety

- The migration script is **rerunnable**. Re-running:
  - parents: upsert on `phone` conflict — repeat runs are no-ops
  - call_logs: upsert on `call_id` conflict — synthetic `legacy-vapi-{ts}-{phone}` IDs are deterministic, so repeat runs don't duplicate
- Migration log file written to `voiceagent/migrations/2026-06-22-sheet-import.log` (gitignored) with:
  - Row counts (parents, call_logs)
  - Skip reasons (malformed JSON, missing phone, unrecognized outcome)
  - Warnings (e.g., "drug_name defaulted to 'unknown' for parent X")

### 11.7 Pre-run dry-run mode

Script accepts `--dry-run` flag: parses sheets and prints summary but writes nothing. Always run dry-run first; review output; then run for real.

---

## 12. Open questions

None — all decisions locked via brainstorming 2026-06-22.

---

*End of Master Control design spec. Awaiting Shubh approval before /writing-plans.*
