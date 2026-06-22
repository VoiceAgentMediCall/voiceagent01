# MediCall AI — Voice Agent Project

Hindi-language outbound voice agent that calls elderly Indian parents to confirm medication adherence. Stack: **LiveKit Agents + Sarvam (STT/TTS/LLM) + Twilio SIP + Google Sheet logging.**

> If you're new here, start with **[`docs/MediCall-Master-Documentation.docx`](docs/MediCall-Master-Documentation.docx)** — single-file onboarding for the whole product.

---

## Folder map

| Folder | What's in it |
|---|---|
| **`livekit/`** | The Python LiveKit Agent (`agent.py`) — the brain. STT/LLM/TTS wiring, voicemail detection, webhook POST. Run with `python agent.py dev`. Place outbound test calls with `python dial.py`. |
| **`dashboard/`** | Next.js dashboard (live at https://voiceagent01-production.up.railway.app/). Replaces the legacy Streamlit admin panel, FastAPI browser test, and Apps Script webhook. Tabs: `/admin` (Prompt Editor — edits `admin-panel/prompts.yaml`), `/test` (Browser Test), plus the production webhook at `/api/webhook/livekit`. |
| **`admin-panel/`** | Holds `prompts.yaml` only — the runtime prompt file that `agent.py` reads. Edit it via the dashboard `/admin` tab. (Streamlit UI deprecated 2026-06-22.) |
| **`evals/`** | Promptfoo regression scenarios (3 YAML cases: confirm / deny / symptom). Run with `promptfoo eval`. |
| **`eval-runner/`** | Eval runner harness for the goldenset. |
| **`supabase/`** | Supabase schema — source of truth for call schedule and call logs (replaces the legacy CSV templates). |
| **`docs/`** | Active planning + operator docs. See section below for what each is. |
| **`docs/archive/`** | Vapi-era plans kept for audit trail (pre-migration). |
| **`docs/research/`** | 5 deep-dive research docs (LiveKit Cloud, Sarvam plugin, Twilio SIP, DX stack, Silero VAD). |
| **`reference/`** | Source material: master plan, raw survey responses, validation framework, the original survey xlsx. |
| **`reference/originals/`** | Original Word brainstorms (kept for historical formatting / notes). |
| **`hellocounsel prompts and stuff/`** | Voice-agent reference material from HelloCounsel work (not MediCall, but useful prompt-engineering reference). |

---

## How to run end-to-end

| Step | Command | Where |
|---|---|---|
| 1. Install agent deps (once) | `pip install -r requirements.txt` | `livekit/` |
| 2. Install dashboard deps (once) | `npm install` | `dashboard/` |
| 3. Boot the agent (leave running) | `python agent.py dev` | `livekit/` |
| 4. Boot the dashboard (leave running) | `npm run dev` → http://localhost:3000 (use `/admin` for prompt editor, `/test` for browser test) | `dashboard/` |
| 5. Place a real phone call | `python dial.py [+91XXXXXXXXXX]` | `livekit/` |
| 6. Run regression evals | `promptfoo eval` | `evals/` |

> The production dashboard is deployed at https://voiceagent01-production.up.railway.app/ — LiveKit posts call results to `/api/webhook/livekit` there (replacing the legacy Apps Script webhook).

---

## Active docs (read in this order)

| Doc | Purpose |
|---|---|
| `docs/MediCall-Master-Documentation.docx` | One-stop onboarding doc. Read first. |
| `docs/2026-06-15-medicall-prd-trd.md` | Product Requirements + Technical Requirements (v3, LiveKit-primary). |
| `docs/2026-06-15-medicall-pilot-mvp-design.md` | Locked pilot spec (5 parents, 25 calls, Days 5-9). |
| `docs/2026-06-15-livekit-migration-plan.md` | Why we moved Vapi → LiveKit + the migration architecture. |
| `docs/livekit-provisioning-and-twilio-sip.md` | Step-by-step LiveKit Cloud signup + Twilio SIP trunk wiring. |
| `docs/2026-06-15-phase5-golive-checklist.md` | Single-page operator checklist for taking the migration live. |
| `docs/2026-06-15-phase6-open-decisions.md` | The 4 locked architectural decisions and their reasoning. |
| `docs/2026-06-16-livekit-day1-runbook.md` | Day-1 operator runbook for the LiveKit stack. |
| `docs/SESSION_HANDOFF_v2.md` | Latest session handoff (state of the world). |
| `docs/research/*.md` | 5 reference docs for the architectural choices. |

---

## Team access (Master Control)

Dashboard access uses a strict allowlist + 3-tier role model (admin / editor / viewer) plus a separate `is_master` flag for irrevocable founder access.

### Adding a teammate

1. Sign in to https://voiceagent01-production.up.railway.app/ as an admin
2. Open the **Master Control** tab (sidebar, top — admins only see it)
3. Scroll to **Invite a teammate** → enter email + pick a role:
   - **admin** — everything + Master Control + can invite/remove teammates
   - **editor** — edit prompts, manage parents, run evals, place test calls
   - **viewer** — read-only across the dashboard
4. They sign in via Google OAuth → land in the dashboard with the assigned role
5. Every invite + role change is recorded in the **Audit log** card at the bottom

### Promoting someone to master admin

Master status is **SQL-Editor-only by design** — there's no UI to grant it. The bar is intentionally high: a compromised/rogue admin can't accidentally make someone untouchable.

Two-step process:

1. **First invite them as admin via Master Control** (steps above) — they sign in once.
2. **Then in Supabase SQL Editor** (https://supabase.com/dashboard/project/alzdxsjkvkqmvhrmbkrc/sql/new) run:
   ```sql
   update public.users
     set is_master = true
     where email = 'theperson@example.com';

   -- verify
   select email, role, is_master from public.users
     where email = 'theperson@example.com';
   -- expected: role=admin, is_master=true
   ```
3. Refresh `/master` in the dashboard → their row shows a **MASTER** badge next to their role.

### What master status guarantees

- **Cannot be demoted** via the UI (the role Select is disabled with a tooltip)
- **Cannot be removed** via the UI (the Remove button is disabled)
- **DB-enforced**: a CHECK constraint (`users_master_implies_admin`) ensures a master row always has `role='admin'`
- **Multiple masters supported** — co-founders can each have it

### Removing master status

Same SQL Editor path (no UI):
```sql
update public.users set is_master = false where email = '...';
```

After flipping, they can be demoted/removed via Master Control like any other admin.

### Why allowlist + roles + master flag

| Threat | Mitigation |
|---|---|
| Random Google account signs in | Lands on `/not-authorized` (not in `allowed_emails`) |
| Compromised admin invites a rando | Worst case: rando is `viewer`; admin can't auto-promote anyone to master |
| Compromised admin demotes a founder | Master flag blocks the demotion at API + DB layers |
| Last admin gets demoted/removed | API rejects with "You're the only admin — promote someone else first" |
| Master admin clicks Remove on themselves | UI disables the action; API rejects if reached |

---

## Credentials (NEVER commit)

These live at the repo root, gitignored:
- `sarvam_api_key.txt`
- `twilio_credentials.txt` (Account SID, Auth Token, +1 number)
- `twilio_sip_password.txt` (SIP trunk outbound credential list)
- `twilio_recovery_code.txt` (2FA recovery)
- `vapi_api_key.txt` (legacy — Vapi pilot fallback)
- `livekit/.env` + `dashboard/.env.local` (runtime env vars)

---

## Cost so far

| Item | Spend |
|---|---|
| Vapi pilot (Day 0 test call) | $0.05 (1 call) |
| Twilio (+1 number monthly fee + first LiveKit SIP test) | ~$1.20 |
| Sarvam credits used | 0 (98 free remaining) |
| LiveKit Cloud | $0 (free tier — pilot well within limits) |
| Langfuse Cloud | $0 (free tier) |

---

## What's NOT in this repo (intentional)

- Caregiver web dashboard (Phase A)
- DPDP OTP proxy consent flow (Phase C)
- OCR / Veryfi onboarding (Phase C)
- Exotel telephony (Phase A)
- WhatsApp Business API (Phase A/C)
- Razorpay payments (Phase C)
- Multi-language Indic activation (Phase B — Odia, Bengali, Tamil, Telugu, Malayalam)

See `docs/2026-06-15-medicall-prd-trd.md` §6 Roadmap for the phased plan.
