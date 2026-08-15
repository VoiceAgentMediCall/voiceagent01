# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**MediCall AI** — Hindi-language outbound voice agent that calls elderly Indian parents to confirm medication adherence. Three independently deployable services share a single Supabase (Postgres) database.

| Service | Language | Runtime | Directory |
|---------|----------|---------|-----------|
| Voice agent | Python | LiveKit Agents 1.x | `livekit/` |
| Dashboard + API | TypeScript | Next.js 16 / React 19 | `dashboard/` |
| Eval runner | TypeScript | Fastify + Node | `eval-runner/` |

---

## Commands

### Voice agent (`livekit/`)
```bash
pip install -r requirements.txt       # one-time setup
python agent.py dev                   # start agent worker (leave running)
python dial.py +91XXXXXXXXXX          # place outbound SIP call to a number
python -m pytest tests/               # run unit tests
python -m pytest tests/test_derive_outcome.py  # single test file
```

### Dashboard (`dashboard/`)
```bash
npm install                           # one-time setup
npm run dev                           # dev server → http://localhost:3000
npm run build && npm run start        # production build + start
```

### Eval runner (`eval-runner/`)
```bash
npm install
set -a && source ../.env && source .env && set +a   # this service doesn't self-load dotenv
npm run dev                           # tsx watch (dev)
npm run build && npm run start        # production
```

### Evals (`evals/`)
```bash
cd evals
npx promptfoo eval --config goldenset.yaml --env-path ../.env   # no .env of its own — see § Environment variables
```

### Docker (all three services at once)
```bash
# Fill in .env (repo root, shared) and each service's own .env first (see § Environment variables below).
export $(grep -E '^NEXT_PUBLIC' dashboard/.env.local | xargs)   # NEXT_PUBLIC_* must be in
                                                                  # the shell at build time —
                                                                  # Next.js inlines them into
                                                                  # the client bundle then,
                                                                  # not at container start.
docker compose up --build
```
Dashboard → http://localhost:3000, eval-runner health check → http://localhost:3001/health. `livekit-agent` has no exposed port — it only makes outbound connections to LiveKit Cloud.

`eval-runner/Dockerfile` and `livekit/Dockerfile` build from the **repo root** as context (not their own subdirectory) — both need sibling directories at runtime (`evals/goldenset.yaml`, `prompt-config/prompts.yaml` respectively) that don't exist inside their own folder. `dashboard/Dockerfile` builds from `dashboard/` since it has no cross-directory runtime dependencies. All three Node-based images pin `node:22-slim`, not 20 — `@supabase/supabase-js`'s Realtime client requires native WebSocket support (added in Node 22) and throws at import time without it.

---

## Architecture

### Voice agent (`livekit/agent.py`)

The agent uses **LiveKit Agents SDK** with **Sarvam AI** for all speech/language:
- **STT**: Sarvam `saaras:v3` (hi-IN)
- **TTS**: Sarvam `bulbul:v2`, speaker=anushka
- **LLM**: `sarvam-30b` via OpenAI-compatible endpoint (`https://api.sarvam.ai/v1`)
- **VAD**: Silero (upstream speech segmentation)

**Call flow**: `entrypoint()` → `AgentSession` start → first message spoken → `_watchdog()` asyncio task monitors silence/max duration → `derive_outcome()` → `post_end_of_call_report()` POSTs JSON to the dashboard webhook.

**Outcome derivation** (`derive_outcome`) uses a priority chain: voicemail_detector → tool_call (LLM called `report_outcome`) → json_trailer (LLM emitted `{"outcome":"..."}` JSON in its message) → keyword_match (Hindi keywords on transcript) → watchdog (fallback = NO_ANSWER).

**`VoicemailDetector`** (`voicemail_detector.py`) sits above Silero VAD. It classifies the far-end as HUMAN/VOICEMAIL/UNKNOWN based on response timing and monologue length.

**Prompt loading**: `agent.py` reads `prompt-config/prompts.yaml` at startup for `system_prompt`, `first_message`, `variables` (parent_name, drug_name, phone), and `version`. Falls back to env vars if the file is missing.

**`DASHBOARD_WEBHOOK_URL`** env var is required — agent raises `RuntimeError` loudly if unset (no silent fallback).

**Langfuse** tracing is optional: if `LANGFUSE_PUBLIC_KEY` is set, `@observe` decorators activate; otherwise they're no-ops.

### Dashboard (`dashboard/`)

Next.js 16 app with App Router. **Read `dashboard/AGENTS.md` before modifying — this version has breaking API changes from earlier Next.js.**

**Auth**: Supabase Auth (email/password; Google OAuth exists in code but is off by default, gated behind `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`) + middleware (`src/middleware.ts`) enforces allowlist. Users with `role = 'pending'` are redirected to `/not-authorized`.

**Role model**: `admin` / `editor` / `viewer` / `pending` + `is_master` boolean. Master status can only be granted/revoked via Supabase SQL Editor — no UI path. The DB enforces `users_master_implies_admin` CHECK constraint (migration 002).

**Supabase client split**:
- `src/lib/supabase/client.ts` — browser client (anon key)
- `src/lib/supabase/server.ts` — server component client (SSR cookies)
- `src/lib/supabase/service.ts` — service role client (API routes that bypass RLS)

**Key API routes**:
- `POST /api/webhook/livekit` — receives end-of-call payload from `agent.py`, upserts into `call_logs` (idempotent on `call_id`)
- `GET/POST /api/prompts` — manages versioned prompts in Supabase; only one `is_active` prompt at a time (enforced by unique partial index)
- `GET/POST /api/eval/trigger`, `GET /api/eval/[id]` — creates `eval_runs` rows; Postgres NOTIFY triggers the eval-runner worker
- `/api/master/*` — team management (users, invites, audit log); admin-only

**All central types** are in `src/lib/types.ts`.

### Eval runner (`eval-runner/src/index.ts`)

Fastify HTTP server + Postgres `LISTEN eval_runs_queue`. When the dashboard triggers an eval, it inserts a row into `eval_runs` (status=`queued`), which fires a `pg_notify`. The eval-runner receives the notification, fetches the active prompt from Supabase, injects it into `evals/goldenset.yaml`, runs `promptfoo eval`, and writes results back to `eval_runs`.

### Database (`supabase/migrations/`)

Tables: `users`, `prompts`, `parents`, `call_logs`, `eval_runs`, `allowed_emails`, `audit_log`. Apply migrations in order via Supabase SQL Editor. **Before assuming a project is set up, verify the migrations have actually been applied** — `select table_name from information_schema.tables where table_schema='public'` should return all 7 tables; a fresh/empty result means neither migration has run yet. There is no automated migration-tracking mechanism (no Supabase CLI history, no applied-migrations table) — this has to be checked manually per environment.

---

## Environment variables

Credentials are split between one shared file and three per-service files — anything used by 2+ services lives in the shared one, anything used by exactly one service lives in that service's own file. This replaced a setup where the same Supabase/LiveKit/Groq credentials were copy-pasted across multiple files.

**`.env`** (repo root, copy from `.env.example`) — shared across services:
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` — same value, two names (Next.js requires the `NEXT_PUBLIC_` prefix to expose a var client-side)
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `GROQ_API_KEY`

Loaded automatically by: `livekit/agent.py` (via `load_dotenv()`, before the service-specific file), `dashboard/npm run dev|build|start` (via the `dotenv-cli` wrapper in `package.json`'s scripts), and every service's Docker container (`env_file:` list in `docker-compose.yml`, first entry). For eval-runner locally (non-Docker) and evals/promptfoo, see below — neither auto-loads it.

**`livekit/.env`** (copy from `livekit/.env.example`) — livekit-only:
- `SARVAM_API_KEY`
- `DASHBOARD_WEBHOOK_URL` — required; points to `/api/webhook/livekit`
- `SIP_TRUNK_ID` — required for `dial.py`
- `LANGFUSE_*` — optional tracing

**`dashboard/.env.local`** (copy from `dashboard/.env.local.example`) — dashboard-only:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` — leave `false` unless Google OAuth is actually configured in Supabase Auth

**`eval-runner/.env`** (copy from `eval-runner/.env.example`) — eval-runner-only:
- `SUPABASE_DB_URL` — use the **Session Pooler** connection string (port 5432 via `aws-0-<region>.pooler.supabase.com`), not the Direct connection string. The direct `db.<ref>.supabase.co` host is IPv6-only on many networks and this service's `LISTEN`/`NOTIFY` worker will fail to connect.
- `PORT` — defaults to `3001` (not `3000`, which collides with the dashboard's Next.js dev server if both run locally at once)

eval-runner doesn't load any `.env` file itself (no code path calls `dotenv.config()`) — Docker gets both files via `env_file:`; for local (non-Docker) runs, source both manually: `set -a && source ../.env && source .env && set +a && node dist/index.js`.

**`evals/`** has no `.env` of its own anymore — `GROQ_API_KEY` lives only in the repo-root `.env`. Point promptfoo at it explicitly: `npx promptfoo eval --config goldenset.yaml --env-path ../.env` (promptfoo's own env loading defaults to its CWD, so this flag is required, not optional, when running from `evals/`).

---

## Key constraints

- `prompt-config/prompts.yaml` is the **runtime source of truth** for the agent prompt — edit it via the dashboard `/admin` tab (the old Streamlit UI has been fully removed, not just deprecated).
- Only one prompt can be `is_active=true` at a time (Postgres unique partial index `prompts_one_active`).
- The `outcome` fallback chain in `derive_outcome()` is load-bearing — don't reorder the priority checks.
- Sarvam LLM model: `sarvam-m` is deprecated (2026-06); use `sarvam-30b` or `sarvam-105b`.
- The eval goldenset (`evals/goldenset.yaml`) must stay byte-equivalent to `prompt-config/prompts.yaml` prompt content — keep variable names (`parent_name`, `drug_name`) in sync between files.
- `evals/goldenset.yaml`'s `defaultTest.options.provider` must stay set explicitly (currently `groq:llama-3.3-70b-versatile`). Without it, promptfoo falls back to its built-in default grader, which in some promptfoo releases resolves to a stub that unconditionally errors on every `llm-rubric` assertion.

---

## Caregiver app design (Phase A — not yet built)

The full consumer-facing caregiver app is designed but not implemented. All design artefacts live in:

```
../voiceAgent01-docs/stitch_medicall_ai_caregiver_app/
  medicall_ai_design_system/DESIGN.md   ← canonical design system
  <screen_name>/screen.png              ← visual reference
  <screen_name>/code.html               ← Tailwind HTML implementation
```

The spec document is `../voiceAgent01-docs/caregiver-app-onboarding-design.md` (1932 lines — full screen-by-screen implementation spec including data model, error handling, and API contracts).

### Design system tokens

**Colors** (all used in the Tailwind config of every screen HTML):
| Role | Hex | Usage |
|------|-----|-------|
| `primary` | `#8d4b00` / button fill `#D97706` | Brand, primary CTAs |
| `secondary` | `#006c49` | CONFIRMED outcomes, adherence positive |
| `error` | `#ba1a1a` | ESCALATED, danger states |
| `background` | `#fcf9f8` | Page base (warm cream, not pure white) |
| `surface-container-lowest` | `#ffffff` | Cards |
| `on-surface` | `#1b1b1b` | Primary text |
| `on-surface-variant` | `#554336` | Secondary text |
| `outline-variant` | `#dbc2b0` | Borders |

**Typography:**
- UI / English: `Inter` (400/500/600/700)
- Hindi / Devanagari: `Hind` (Indian Type Foundry, Google Fonts) — class `font-label-hi`
- Dosage / transcript data: `JetBrains Mono` — class `font-code`

**Spacing:** 8px base grid. Scale: xs=4, sm=8, md=16, lg=24, xl=32, 2xl=48.

**Elevation:** tonal layering, not borders. Cards: `box-shadow: 0px 4px 12px rgba(27,27,27,0.05)`. Modals: `0px 12px 32px rgba(27,27,27,0.1)`.

**Radius:** 8px inputs, 12px cards/buttons, 16px modals, 9999px pills.

### Screen inventory (8 onboarding + 5 dashboard surfaces)

| Screen folder | What it shows |
|---------------|---------------|
| `onboarding_setup_step_1` | Caregiver phone OTP (their number, not parent's) |
| `onboarding_parent_details_step_2` | Parent name, phone, relationship chip, language picker |
| `onboarding_prescription_step_3` | Camera/upload, prescription type chips, doctor name |
| `onboarding_ocr_review_step_4` | Editable medication grid grouped by Rx; DDI passive warnings |
| `onboarding_consent_step_5` | Consent checkbox, WhatsApp briefing message copy, notification prefs |
| `onboarding_schedule_step_6` | Auto-generated call schedule preview, Smart Retry info |
| `onboarding_self_test_step_7` | "Call me now" — agent calls caregiver's own number |
| `onboarding_success_step_8` | Countdown to first parent call, "What happens next" |
| `dashboard_home_1` / `dashboard_home_2` | Today-feed, 92% adherence donut, live call shimmer state |
| `dashboard_parent_details` | Parent profile, prescriptions by Rx group, Pause/Revoke |
| `dashboard_escalation_modal` | ESCALATED alert: Hindi transcript + English, "Call Mom now" CTA |
| `dashboard_paywall` | Day-7 full-screen paywall: ₹499/month Premium Care |
| `landing_page_desktop` / `landing_page_mobile` | Marketing landing with sample call player |

**Each folder has both `_high_fidelity` and wireframe variants.** Use `_high_fidelity/screen.png` as the implementation target.

### Key design decisions (locked)
- Account model v1: 1 caregiver : 1 parent (multi-parent deferred to Phase B)
- Auth: phone OTP (not Google OAuth — different from operator dashboard)
- No payment screen in onboarding funnel — 7-day free trial, paywall on Day 7 inside dashboard
- ESCALATED phone call to caregiver is hardcoded, not opt-out
- Prescription upload is required (no skip); manual entry is the fallback inside Step 4
- Multi-prescription: up to 5 per parent (soft cap), loop S3→S4 doesn't advance progress bar
- Language v1: Hindi only activated; 6 others gated on per-language goldenset pass
- Payment: Razorpay (UPI + cards + netbanking, supports NRI international cards)
