# Phase 6 — Open Decisions to Lock In

**Date:** 2026-06-15
**Status:** 4 decisions surfaced with recommendations. **Shubh's call.**
**Predecessors:** `2026-06-15-livekit-migration-plan.md` §10 (recommendations), Phase 1-5 deliverables built.
**Output of this doc:** Shubh writes his answer in the "Locked" column, then I update PRD/TRD v3 to match.

---

## Decision-locking template

Each decision below has:
- **Question** — the actual choice
- **Options** — with one-line pros/cons
- **Recommend** — my call with reasoning
- **Locked** — Shubh writes the chosen option here when ready

---

## Decision 1 — LiveKit Cloud vs self-host

| | |
|---|---|
| **Question** | For the migration build + pilot Days 5-9, do we run on LiveKit Cloud or self-host LiveKit Server? |
| **Options** | **A. LiveKit Cloud** — managed, free tier covers pilot, ~5-min setup, audio processed outside India. **B. Self-host** — Docker on Hetzner/Render (~$5/mo VPS), full control, audio-in-India possible (DPDP-friendly), ~2-3hr setup + ongoing ops. |
| **Recommend** | **A — LiveKit Cloud now; plan self-host migration for Phase A when DPDP timeline forces audio-in-India.** Time-to-first-call wins for pilot; DPDP isn't a blocker at 5-parent warm-consent scale; Phase A (50 parents, sales) is when audio-residency matters. |
| **Why now** | Pilot has 25 calls and ends in 10 days. Self-host pays back over months, not days. |
| **Locked** | _____ |

---

## Decision 2 — Cutover or A/B for pilot Days 5-9

| | |
|---|---|
| **Question** | When Phase 5 acceptance passes, do we (B1) full-cutover all 5 pilot parents to LiveKit immediately, (B2) run A/B (some parents on Vapi, some on LiveKit), or (B3) keep Vapi for the full pilot and migrate post-Day-10? |
| **Options** | **B1 cutover** — clean single-stack signal; risk: any LiveKit voice regression contaminates the entire pilot's engagement test. **B2 A/B** — real side-by-side comparison; 2× operator attention; preserves Vapi as fallback. **B3 wait** — zero risk to pilot data; delays Phase A start by ~10 days. |
| **Recommend** | **B2 — A/B**, parents 1-3 on Vapi (via Vapi dashboard "Dial"), parents 4-5 on LiveKit (via Part E SIP snippet). Same prompt verbatim. Sheet has `stack` column. Day-10 synthesis compares both stacks on outcome rate + voice quality + latency + transcript intelligibility. |
| **Cutover trigger at Day 10** | If LiveKit ≥ Vapi on **all four** axes → full cutover for Phase A. If worse on any → keep Vapi for Phase A, retry LiveKit pre-Phase-B when multi-lang forces the migration anyway. |
| **Locked** | _____ |

---

## Decision 3 — Prompt storage location

| | |
|---|---|
| **Question** | Where does the live prompt live — file in repo or DB row? |
| **Options** | **C1 YAML file** (`voiceagent/admin-panel/prompts.yaml`) — zero infra, git-tracked, single source of truth, admin-UI reads/writes. **C2 Supabase row** — auditable, multi-user-ready, requires a Supabase project + auth + RLS. |
| **Recommend** | **C1 YAML for pilot. C2 Supabase row at Phase A kickoff.** Pilot has 1 prompt, 1 operator, no audit requirement. Phase A introduces multi-prompt + change-history + ops auditability. |
| **Migration path** | Phase A: Streamlit form posts to Supabase REST API; agent.py polls or websockets the row instead of reading YAML. ~2hr port. |
| **Locked** | _____ |

---

## Decision 4 — Admin-UI framework

| | |
|---|---|
| **Question** | What's the admin-UI built on for the pilot? |
| **Options** | **D1 Streamlit** (chosen and built in Phase 4d) — 1 .py file, no auth, runs `streamlit run app.py`, opens in browser. **D2 Next.js + Supabase** — real app, auth, multi-user, ~1-2 days to build, hostable on Vercel. |
| **Recommend** | **D1 Streamlit (already built). D2 Next.js + Supabase at Phase A when caregivers see a dashboard.** Streamlit costs zero design effort and matches single-operator pilot scope. |
| **Already built** | `voiceagent/admin-panel/app.py` + `prompts.yaml` + `README.md`. Run with `streamlit run app.py` from that dir. |
| **Locked** | _____ |

---

## Companion decisions (auto-derived, no Shubh input needed unless overriding)

| # | Question | Default |
|---|---|---|
| E1 | Sarvam LLM model | `sarvam-m` (per migration plan §3); fallback `gpt-4o-mini` if rate-limited |
| E2 | Sarvam TTS voice | `bulbul:v3` speaker `anushka` (Hindi female); change in `agent.py` if Shubh wants a male voice |
| E3 | Outbound CID for pilot | `+1 (814) 524 3223` (current Twilio number; unchanged from Vapi pilot) |
| E4 | Pilot data retention | Manual delete after Day 10 (per pilot MVP spec §Out of scope) |
| E5 | Langfuse hosting | Langfuse Cloud free tier (~50k events/mo; pilot uses <100) |
| E6 | Promptfoo runner | Local `promptfoo eval`; no CI integration in pilot scope |
| E7 | Voicemail-detection threshold | `greeting_max_silence_s=4.0` (permissive for slow-speaking elderly per `voicemail_detector.py`) |

If Shubh disagrees with any E#, override in PR/edit; otherwise these are locked.

---

## Decisions that are **closed** as of v2 PRD/TRD

| # | Question | Decision | Closed when |
|---|---|---|---|
| Closed-1 | Vapi vs LiveKit | LiveKit primary | 2026-06-15 PM (this session, PRD/TRD CHANGELOG v2) |
| Closed-2 | Sarvam STT/TTS/LLM as primary providers | Yes — `livekit-plugins-sarvam` | 2026-06-15 PM |
| Closed-3 | Keep Twilio +1 (814) 524 3223 for pilot | Yes — no Exotel until Phase A | 2026-06-15 AM (pilot MVP spec §Telephony) |
| Closed-4 | Google Sheet + Apps Script as pilot data sink | Yes — Supabase deferred to Phase A | 2026-06-15 AM (pilot MVP spec §Stack) |
| Closed-5 | A/B Sheet schema gets `stack` column | Yes — `webhook_v2.gs` handles both payloads | 2026-06-15 PM (Phase 4c) |

---

## How to lock decisions

1. Edit this file. Write your choice in each "Locked" cell (e.g. `A`, `B2`, `C1`, `D1`).
2. Date-stamp: append "(locked 2026-06-XX)".
3. Tell me: "decisions locked, update PRD/TRD". I'll update `2026-06-15-medicall-prd-trd.md` §Open Decisions to reflect the closures and bump to v3.

---

## Recommendation summary (TL;DR)

| Decision | Recommend |
|---|---|
| 1. LiveKit Cloud vs self-host | **Cloud** for migration; self-host plan Phase A |
| 2. Cutover vs A/B | **A/B for Days 5-9**, parents 1-3 Vapi / 4-5 LiveKit |
| 3. Prompt storage | **YAML** for pilot; Supabase row Phase A |
| 4. Admin-UI framework | **Streamlit** (already built); Next.js+Supabase Phase A |

**If you just want to say "all four recommended", that's a single message and I'll close the loop. No deeper consideration needed unless you have a specific reason to override.**

---

*End of Phase 6 decisions doc. Awaiting Shubh's "Locked" entries (or "go with all 4 recommendations").*
