# Session Handoff — 2026-06-15 (end of Day 0 build)

## Where we are

**MediCall AI Day-0 pilot stack is LIVE on Vapi.** First end-to-end test call to Shubh succeeded (42s, $0.05 on Vapi). Pilot can run as-is for the 25-call engagement test.

**Decision locked this session: migrate from Vapi → LiveKit Agents (Cloud) + Sarvam for Phase A.**

Reasons (don't re-litigate):
- Vapi has no native Sarvam STT/TTS (confirmed via Vapi API error). Building a Vapi-Sarvam proxy = worst of both worlds (Vapi $0.08/min + proxy ops + still no Indic multi-language for Phase B).
- LiveKit has **native** Sarvam plugins (STT/TTS/LLM).
- LiveKit Cloud is ~3× cheaper at scale (~$0.025/min vs Vapi $0.08/min).
- Multi-language Phase B (Odia, Bengali, Tamil, Telugu, Malayalam) requires Sarvam — Vapi can't deliver this quality.
- DPDP compliance easier with LiveKit self-host fallback (data stays in India).

## What's already done (don't redo)

| Item | Status | Reference |
|---|---|---|
| Twilio account + +1 (814) 524 3223 number | LIVE | `voiceagent/twilio_credentials.txt` |
| Shubh +91 (+918104348262) verified as Twilio Caller ID | DONE | — |
| Vapi assistant `MediCall Hindi Pilot v0` created | DONE — ID `0065daae-664a-4780-834f-f215a3879dac` | `voiceagent/scaffolds/vapi_assistant.json` |
| Vapi-Twilio phone number trunk attached | DONE — ID `fbac2c71-a272-4e3f-889f-284f5587b1c8` | — |
| Google Sheet `medicall-pilot-log` (schedule + call_logs tabs) | DONE | — |
| Apps Script webhook deployed as Web App | DONE — URL ends `/AKfycbzcplIZ.../exec` | `voiceagent/scaffolds/webhook.gs` |
| Vapi end-of-call webhook wired to Apps Script | DONE — PATCHed | — |
| First test call to +918104348262, 42s, ended cleanly | DONE — Vapi log confirmed | — |
| Day 0-10 implementation plan | DONE | `voiceagent/docs/2026-06-15-medicall-implementation-plan.md` |
| PRD + TRD doc | DONE | `voiceagent/docs/2026-06-15-medicall-prd-trd.md` |
| Day-0 operator runbook | DONE | `voiceagent/docs/2026-06-15-day0-runbook.md` |
| PowerShell manual trigger snippet | DONE | `voiceagent/scaffolds/trigger_call.md` |

## Credentials (local files, do NOT commit)

- `voiceagent/twilio_credentials.txt` — SID, Auth Token, +1 number
- `voiceagent/twilio_recovery_code.txt` — Twilio 2FA recovery
- `voiceagent/vapi_api_key.txt` — Vapi private key
- `voiceagent/sarvam_api_key.txt` — Sarvam API key (98 credits left, untouched)

## Key facts

- **Vapi PAYG balance:** 9.95 credits after test call
- **Twilio trial balance:** $14.35 (after $1.15 monthly number fee)
- **Sarvam balance:** 98 credits (Rs 1000 sign-up credit, none used yet — Sarvam not wired in Day-0)
- **No automatic calls fire** — all triggers are manual (PowerShell or Vapi dashboard click)
- **Schedule tab is reference data only** — nothing reads it to auto-trigger
- **Caller ID parents see: +18145243223 (US number)** — pilot writeup must caveat this contaminates the "cold +91 engagement" question. The pilot's real question is now: "will pre-briefed parents engage with AI on a +1 number?"

## Next-session objectives (in order)

1. **Read** all docs in `voiceagent/docs/` to absorb context (don't re-research the survey, master plan, spec)
2. **Plan** the LiveKit migration end-to-end (use `/plan` skill)
3. **Update** the PRD/TRD doc with the LiveKit-as-primary architecture decision (the existing doc currently lists this as a deferred decision)
4. **Research** (parallel agents):
   - LiveKit Cloud signup, pricing, region availability (India region?)
   - LiveKit Agents Python framework — quickstart, voice pipeline, telephony
   - Latest LiveKit Sarvam plugin (livekit-plugins-sarvam) — STT/TTS/LLM versions, model names, language codes
   - Twilio SIP trunk -> LiveKit room dispatch (vs. Vapi's automatic Twilio integration)
   - Voicemail detection in LiveKit (Silero VAD or community plugin)
5. **Spin agents** to:
   - Port Vapi assistant config (system prompt, dialogue tree, guardrails) -> Python LiveKit Agent class
   - Port Apps Script webhook (end-of-call event handler) — keep the Sheet logging
   - Build the DX layer (next section — non-negotiable per user)
6. **Wire** Twilio -> LiveKit, deploy LiveKit Agent, run a parallel test call to Shubh, compare voice quality vs Vapi Day-0
7. **Decide** at end of next session: keep both stacks parallel for A/B during pilot Days 5-9, OR cut over fully to LiveKit before Day 4

## DX layer requirements (non-negotiable — user's call)

User explicitly wants LiveKit's missing DX wins replicated. The migration is NOT done until these are in place:

| Vapi DX win | LiveKit replacement to build/install | Acceptance bar |
|---|---|---|
| **Dashboard chat with assistant (no real call)** | Local agent runner + web client (livekit-cli + browser room) OR a Streamlit/Gradio app that talks to the deployed agent | A non-tech PM can paste a prompt and hear the agent respond, in browser |
| **Visual prompt + dialogue editor** | A minimal internal admin UI (Next.js or Streamlit) reading/writing the assistant config from a YAML or DB record. **Critical: PMs must edit prompts WITHOUT touching code.** | A non-tech PM can edit the Hindi prompt + dialogue tree + first message + variables, save, and the next call uses the new version |
| **Observability dashboard (calls, costs, transcripts)** | **Langfuse** (open-source) — already has LiveKit + Sarvam tracing | Per-call: latency, cost, full transcript, audio recording link, LLM trace |
| **Evals (test scenarios against assistant)** | **Promptfoo** (open-source) — define YAML scenarios, run against agent | A test like "parent says 'haan'" -> assert outcome=CONFIRMED can be run on every prompt change |
| **Voicemail detection** | **Silero VAD** plugin + ~10 lines of Python | Distinguish human "hello" from voicemail prompt; log NO_ANSWER appropriately |
| **Hosted UI for non-techs** | Combination of admin UI + Langfuse dashboard, both deployed (Vercel or Render) with auth (Clerk free tier) | One URL, one login, your PM sees everything |

## Out of scope for next session

- Pilot calls to real parents (Day 4 onward) — wait until migration is verified
- Multi-language activation (Phase B) — migration unlocks it but don't ship Odia yet
- Production scale (50 parents) — Phase A, post-pilot
- Exotel migration — Phase A
- DPDP OTP proxy consent flow — Phase A

## Open decisions to surface at start of next session

1. **LiveKit Cloud vs self-host** — Cloud is faster (managed). Self-host is cheaper at scale + data sovereignty. Recommend Cloud for migration, plan self-host path for Phase A.
2. **Cut over or A/B?** — Cut over loses the Vapi pilot in progress. A/B keeps both alive for Days 5-9 comparison. Recommend A/B.
3. **DX UI hosting** — Vercel (faster) vs self-deploy. Recommend Vercel free tier.
4. **Where prompt config lives** — YAML file in repo (eng edits) vs Supabase row (PM edits via UI). Recommend Supabase row.

## Files to read FIRST in next session (in order)

1. This file
2. `voiceagent/docs/2026-06-15-medicall-pilot-mvp-design.md` — the locked spec
3. `voiceagent/docs/2026-06-15-medicall-prd-trd.md` — current PRD/TRD
4. `voiceagent/docs/2026-06-15-medicall-implementation-plan.md` — Day 0-10 plan (Day 0 mostly done)
5. `voiceagent/docs/2026-06-15-day0-runbook.md` — operator runbook
6. `voiceagent/scaffolds/vapi_assistant.json` — current assistant config to port
7. `voiceagent/scaffolds/webhook.gs` — current Apps Script handler to port

## Session cost note

This session cost ~$78. Budget for next session: ~$50-80 for full migration + research + DX layer (multiple agents).
