# MediCall AI — Voice Agent Project

Hindi-language outbound voice agent that calls elderly Indian parents to confirm medication adherence. Stack: **LiveKit Agents + Sarvam (STT/TTS/LLM) + Twilio SIP + Supabase (Postgres/Auth) + Next.js dashboard.**

> **Start with [`CLAUDE.md`](CLAUDE.md)** — that's the maintained onboarding doc (architecture, commands, env vars, constraints). This README is a quick orientation map; `CLAUDE.md` is what's kept accurate day to day.

---

## Folder map

| Folder | What's in it |
|---|---|
| **`livekit/`** | The Python LiveKit Agent (`agent.py`) — the brain. STT/LLM/TTS wiring, voicemail detection, webhook POST. Run with `python agent.py dev`. Place outbound test calls with `python dial.py`. |
| **`dashboard/`** | Next.js operator dashboard. Tabs: Home, Admin (prompt editor), Browser Test, Evals, Calls, Schedule, Costs, Settings, Master Control. Note: Costs and Settings currently render static placeholder content, not live data. |
| **`prompt-config/`** | Holds `prompts.yaml` only — the runtime prompt file `agent.py` reads. Edit it via the dashboard's Admin tab. (The old Streamlit admin panel this folder was named after has been fully removed, not just deprecated — hence the rename from `admin-panel/`.) |
| **`evals/`** | Promptfoo goldenset (`goldenset.yaml`, 4 scenarios: confirm / deny / symptom / clarify). Run with `promptfoo eval --config goldenset.yaml --env-path ../.env` (has no `.env` of its own — see `.env` below). |
| **`eval-runner/`** | Fastify service that listens on Postgres `eval_runs_queue` (via `LISTEN`/`NOTIFY`) and runs the goldenset when the dashboard triggers an eval. |
| **`supabase/migrations/`** | Schema source of truth — `users`, `prompts`, `parents`, `call_logs`, `eval_runs`, `allowed_emails`, `audit_log`. Apply in order via Supabase SQL Editor; verify what's actually applied before assuming a project is set up (see `CLAUDE.md`). |
| **`docs/`** | Dated planning + operator docs, newest first is usually most relevant. See `docs/archive/` for anything superseded. |
| **`docs/archive/`** | Superseded plans and historical session records, kept for audit trail — not current guidance. |
| **`reference/`** | Background material: master plan, survey responses, validation framework, research memos (`reference/research/`), original Word brainstorms (`reference/originals/`), and HelloCounsel prompt-engineering reference (`reference/hellocounsel/`). |
| **`docker-compose.yml`** | Runs all three services (dashboard, eval-runner, livekit-agent) together. See "How to run end-to-end" below. |
| **`.env`** (repo root) | Shared Supabase/LiveKit/Groq credentials, copy from `.env.example`. Anything used by only one service lives in that service's own `.env` instead — see `CLAUDE.md` § Environment variables for the full split. |

---

## How to run end-to-end

### Option A — Docker (recommended, all three services at once)

```bash
# Fill in .env (repo root, shared credentials) and each service's own .env first
# (see CLAUDE.md § Environment variables).
export $(grep -E '^NEXT_PUBLIC' dashboard/.env.local | xargs)
docker compose up --build
```

Dashboard → http://localhost:3000, eval-runner health check → http://localhost:3001/health. See `CLAUDE.md` § Docker for why `eval-runner`/`livekit` build from the repo root (not their own subdirectory) and why all three images pin Node 22.

### Option B — run each service manually

| Step | Command | Where |
|---|---|---|
| 1. Install agent deps (once) | `pip install -r requirements.txt` (use a venv — recent macOS Python is externally-managed) | `livekit/` |
| 2. Install dashboard deps (once) | `npm install` | `dashboard/` |
| 3. Install eval-runner deps (once) | `npm install && npm run build` | `eval-runner/` |
| 4. Copy each `.env.example` → the real file and fill in credentials | `.env` (repo root, shared) + `livekit/`, `dashboard/`, `eval-runner/` — see `CLAUDE.md` § Environment variables | repo root + `livekit/`, `dashboard/`, `eval-runner/` |
| 5. Boot the agent (leave running) | `python agent.py dev` | `livekit/` |
| 6. Boot the dashboard (leave running) | `npm run dev` → http://localhost:3000 (loads `../.env` + `.env.local` via `dotenv-cli`) | `dashboard/` |
| 7. Boot the eval-runner (leave running) | `set -a && source ../.env && source .env && set +a && node dist/index.js` | `eval-runner/` |
| 8. Place a real phone call | `python dial.py +91XXXXXXXXXX` | `livekit/` |
| 9. Run regression evals | `npx promptfoo eval --config goldenset.yaml --env-path ../.env` | `evals/` |

Note on ports: the dashboard's Next.js dev server and `eval-runner`'s Fastify server both default to `3000` — `eval-runner/.env.example` sets `PORT=3001` specifically to avoid that collision when running both locally.

---

## Docs worth knowing about

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | The maintained architecture/commands/constraints reference. Read this first. |
| `PRD-TRD.md` | Product + Technical Requirements, v3 — locked, current source of truth for Phase 0 scope. |
| `docs/2026-07-13-db-schema-dataflow-analysis.md` | As-built DB schema, data flow diagrams, and gap analysis vs. the PRD. |
| `docs/2026-07-13-target-schema-and-dataflow.md` | Proposed target schema for near-term feature gaps (caregiver notifications, call dispatch queue, retry chain, consent tracking). |
| `docs/livekit-provisioning-and-twilio-sip.md` | Step-by-step LiveKit Cloud + Twilio SIP trunk provisioning. |
| `docs/2026-06-22-master-control-spec.md` | Design spec for the invite/role/audit-log access system. |
| `docs/archive/` | Superseded PRD versions, session handoffs, and pre-migration Vapi-era plans — historical record, not current guidance. |

---

## Team access (Master Control)

Dashboard access uses a strict allowlist + 4-tier role model (admin / editor / viewer / pending) plus a separate `is_master` flag for irrevocable founder access.

### Adding a teammate

1. Sign in to the dashboard as an admin
2. Open the **Master Control** page (admins only)
3. **Invite a teammate** → enter email + pick a role:
   - **admin** — everything + Master Control + can invite/remove teammates
   - **editor** — edit prompts, manage parents, run evals, place test calls
   - **viewer** — read-only across the dashboard
4. They sign up via email/password (or Google OAuth, if enabled) → land in the dashboard with the assigned role once the `handle_new_user` trigger matches their email against the allowlist
5. Every invite + role change is recorded in the **Audit log**

### Promoting someone to master admin

Master status is **SQL-Editor-only by design** — there's no UI to grant it.

1. First invite them as admin via Master Control — they sign in once.
2. In your Supabase project's SQL Editor, run:
   ```sql
   update public.users
     set is_master = true
     where email = 'theperson@example.com';

   -- verify
   select email, role, is_master from public.users
     where email = 'theperson@example.com';
   -- expected: role=admin, is_master=true
   ```
3. Refresh Master Control in the dashboard → their row shows a **MASTER** badge.

To remove master status, run the same update with `is_master = false`.

### What master status guarantees

- **Cannot be demoted or removed** via the UI
- **DB-enforced**: CHECK constraint `users_master_implies_admin` ensures a master row always has `role='admin'`
- **Multiple masters supported** — co-founders can each have it

---

## Environment variables

Each service has its own `.env`/`.env.local` (all gitignored) with a checked-in `.env.example` template — `livekit/`, `dashboard/` (`.env.local.example`), `eval-runner/`, and `evals/`. Full variable-by-variable reference is in `CLAUDE.md` § Environment variables. Never commit real credentials — only the `.example` templates are tracked.

---

## What's NOT in this repo (intentional)

- Caregiver web dashboard (Phase A)
- Automatic call scheduler / retry chain (Phase A)
- DPDP OTP proxy consent flow (Phase C)
- OCR / Veryfi onboarding (Phase C)
- Exotel telephony migration (Phase A)
- WhatsApp Business API (Phase A/C)
- Razorpay payments (Phase C)
- Multi-language Indic activation (Phase B — Odia, Bengali, Tamil, Telugu, Malayalam)

See `PRD-TRD.md` Part VI (Phased Roadmap) for the full plan.
