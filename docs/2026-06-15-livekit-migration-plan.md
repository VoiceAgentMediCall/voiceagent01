# LiveKit Migration Plan — Vapi → LiveKit Agents + Sarvam

**Date:** 2026-06-15
**Status:** Draft v1 — awaiting Shubh approval before Phase 2
**Parent docs:** `SESSION_HANDOFF_v2.md`, `2026-06-15-medicall-prd-trd.md`, `2026-06-15-medicall-pilot-mvp-design.md`
**Owner:** Shubh (sole operator), Assistant (build)

---

## 1. TL;DR

Replace Vapi (closed orchestrator, no native Sarvam) with **LiveKit Agents on LiveKit Cloud** (open orchestrator, native Sarvam STT/TTS/LLM plugins). Keep Twilio for telephony (now via SIP trunk instead of Vapi's automatic import). Keep Google Sheet + Apps Script as the data sink. Add a non-tech-PM-grade DX layer (admin UI for prompts, Langfuse for observability, Promptfoo for evals, Silero VAD for voicemail). Run **A/B in parallel with Vapi for pilot Days 5-9**; cut over fully only after LiveKit beats or matches Vapi on voice quality + outcome rate.

**One-sentence target architecture:**
`Google Sheet → manual trigger → LiveKit Cloud project → LiveKit Agent (Python) with livekit-plugins-sarvam (STT+TTS+LLM) + Silero VAD → Twilio SIP trunk → parent's mobile → end-of-call hook → Apps Script Web App → Google Sheet (call_logs).`

**Budget for migration:** ~$0 marginal during build (LiveKit Cloud free tier covers dev + 25 pilot calls; Sarvam 98 credits untouched; Twilio $14.35 trial balance covers parallel A/B).

---

## 2. Why migrate (locked, do not re-litigate)

Per `SESSION_HANDOFF_v2.md §Where we are`:

| Reason | Evidence |
|---|---|
| Vapi has no native Sarvam STT/TTS | Confirmed via Vapi API error this session — `customProvider` config does not accept Sarvam endpoint shape cleanly. |
| LiveKit has native Sarvam | `livekit-plugins-sarvam` ships STT, TTS, LLM as first-class adapters. |
| ~3× cheaper at scale | LiveKit Cloud ~$0.025/min vs Vapi $0.08/min (confirm exact numbers in Phase 3 research). |
| Phase B (Odia/Bengali/Tamil/Telugu/Malayalam) needs Sarvam | Vapi cannot deliver Indic multi-lang at Bulbul-v3 quality. |
| DPDP self-host fallback | LiveKit OSS self-host keeps audio in India when DPDP timeline forces it (Phase A). |

---

## 3. Pre / post state diff

| Layer | Today (Vapi pilot) | After migration (Phase A target) |
|---|---|---|
| Orchestrator | Vapi.ai (closed SaaS) | LiveKit Agents (OSS) on LiveKit Cloud |
| STT | Deepgram nova-2 hi (Vapi default) | **Sarvam Saaras** |
| TTS | Azure hi-IN-SwaraNeural | **Sarvam Bulbul v3** (Anushka or similar) |
| LLM | gpt-4o-mini (Vapi default) | **Sarvam-M** (fallback: gpt-4o-mini) |
| Telephony | Twilio +1 (Vapi-imported, automatic) | Twilio +1 → **LiveKit SIP trunk** (manual wire) |
| VAD / voicemail | None (Vapi default) | **Silero VAD** plugin |
| Trigger | Click "Dial" in Vapi dashboard | CLI `python dial.py --to +91...` OR admin-UI button |
| Outcome sink | Vapi webhook → Apps Script | LiveKit end-of-call hook → Apps Script (same Sheet) |
| Observability | Vapi dashboard | **Langfuse** (self-host OSS or Langfuse Cloud free tier) |
| Evals | None | **Promptfoo** YAML scenarios run on every prompt change |
| Prompt editing | Paste JSON into Vapi UI | **Admin UI** (PM edits prompt + first_message + variables, persisted) |
| Chat-with-assistant test | Vapi "Test" button | Browser client (LiveKit room + JS SDK) |
| Monthly fixed cost | $0 (Vapi PAYG only) | $0 (LiveKit Cloud free tier ≤ pilot scale; Langfuse free tier) |

---

## 4. Migration chunks (work breakdown)

Each chunk is independently shippable. Build order = dependency order; A/B test happens after C5.

| # | Chunk | Output | Depends on | Owner |
|---|---|---|---|---|
| C1 | Research bundle | `docs/research/*.md` (5 files from Phase 3 workflow) | — | Assistant (parallel agents) |
| C2 | LiveKit Cloud project | Project created, API key + WS URL captured | LiveKit Cloud signup (Shubh) | Joint |
| C3 | LiveKit Agent Python project | `voiceagent/livekit/` with agent.py, requirements, Dockerfile, .env.example, README | C1 | Assistant |
| C4 | Twilio SIP trunk → LiveKit | SIP trunk created in Twilio, LiveKit dispatch rule, outbound CID = +1 (814) 524 3223 | C2 + C3 | Joint |
| C5 | End-of-call webhook port | Updated `webhook.gs` accepts LiveKit payload shape; same Sheet | C3 | Assistant |
| C6 | Admin UI for prompts | `voiceagent/admin-panel/` (Streamlit + YAML OR Next.js + Supabase — decided by C1) | C3 | Assistant |
| C7 | Langfuse + Promptfoo | Langfuse traces every call; Promptfoo 3 YAML scenarios pass | C3 | Assistant |
| C8 | Silero VAD voicemail | Hindi voicemail prompts distinguished from human "hello"; logged NO_ANSWER | C3 | Assistant |
| C9 | Browser test client | LiveKit room + JS SDK; PM types/speaks, hears agent | C3 | Assistant |
| C10 | Day-1 runbook | `docs/2026-06-16-livekit-day1-runbook.md` | C4-C9 | Assistant |
| C11 | First live test call | Call to +918104348262, end-to-end pass | C4 + C5 + C10 | Joint |
| C12 | A/B vs Vapi (acceptance) | Side-by-side comparison on voice quality, latency, outcome accuracy | C11 | Joint |
| C13 | Cutover or stay-A/B decision | One of: full cutover, A/B-through-pilot, rollback | C12 | Shubh |

---

## 5. Cost comparison (per call, 30-sec average — pilot scale)

Numbers below to be refined in Phase 3 research. Conservative estimates for plan-mode comparison:

| Component | Vapi today | LiveKit target |
|---|---|---|
| Orchestration | $0.05/min × 0.5 = **$0.025** | LiveKit Cloud ~$0.005/min × 0.5 = **$0.0025** (≈ free tier in pilot) |
| STT | Deepgram bundled in Vapi | Sarvam Saaras ≈ ₹0.25 ≈ **$0.003** |
| TTS | Azure bundled in Vapi | Sarvam Bulbul v3 ≈ ₹0.40 ≈ **$0.005** |
| LLM | gpt-4o-mini bundled | Sarvam-M free (or gpt-4o-mini fallback ~$0.001) |
| Telephony (Twilio +1) | $0.0496/min × 0.5 = **$0.025** | Same — **$0.025** |
| **Per-call total** | **~$0.05** | **~$0.035** |
| **25-call pilot total** | ~$1.25 | ~$0.88 |

**Real win is not pilot cost** (both ~$1) — it's Phase A scale (172 calls/day × 30 days = ~5,160 calls/month). Vapi: ~$0.13/call all-in ≈ **$670/mo**. LiveKit: ~$0.08/call all-in ≈ **$413/mo**. Saves ~$3,000/year at 50-parent Phase A scale, and unlocks Phase B Indic langs which Vapi cannot deliver at quality.

---

## 6. DX-layer mapping (non-negotiable per handoff §DX layer requirements)

| Vapi DX win | LiveKit replacement | Build chunk | Acceptance |
|---|---|---|---|
| Dashboard "Chat with assistant" | Browser client (LiveKit room + JS SDK) | C9 | PM opens local URL, clicks Connect, talks/listens to agent. No real phone call. |
| Visual prompt editor | Admin UI (Streamlit YAML OR Next.js+Supabase) | C6 | PM edits prompt + first_message + 3 variables, saves, next call uses new version. |
| Observability dashboard | **Langfuse** | C7 | Per-call: latency, cost, full transcript, audio link, LLM trace. |
| Evals | **Promptfoo** | C7 | 3 YAML scenarios: parent-says-haan→CONFIRMED, nahi→DENIED, symptom→safe-end. Runs in <60s on every prompt save. |
| Voicemail detection | **Silero VAD** | C8 | Distinguish "Aap jis number ko..." voicemail intro from human "Hello" within 1.5s. |
| Hosted single-URL UI for PMs | Admin UI + Langfuse links (local for migration, Vercel/Render in Phase A) | C6 + C7 | One URL → see calls, edit prompts, view traces, run evals. |

---

## 7. Cutover strategy — recommend A/B

Three options:

| Option | Pro | Con | Recommendation |
|---|---|---|---|
| A. Full cutover before Day 5 | Clean signal, one stack to debug | Loses Vapi pilot baseline; if LiveKit has voice-quality regression, pilot is contaminated | ✗ |
| **B. A/B for pilot Days 5-9** | Real side-by-side comparison; Vapi pilot continues uninterrupted; if LiveKit breaks, fall back instantly | Two stacks running; 2× operator attention | **✓ Recommend** |
| C. Stay on Vapi through pilot, migrate post-pilot | Lowest risk to pilot data | Loses 5 days of LiveKit production exposure; delays Phase A start | ✗ |

**A/B mechanics:**
- Parents 1-3 stay on Vapi (Days 5-9), parents 4-5 on LiveKit (Days 5-9).
- Same prompt, same outcome schema, same Sheet (extra column `stack` = `vapi` | `livekit`).
- Day-10 synthesis compares outcome rate, voice quality (operator listen), latency, transcript intelligibility.
- If LiveKit ≥ Vapi on all four: full cutover at Phase A start. If worse on any: keep Vapi for Phase A, retry LiveKit before Phase B (when multi-lang forces the move).

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Twilio SIP trunk wiring to LiveKit fails (auth / codec / DTMF) | Medium | Blocks C11 | Phase 3 research validates exact Twilio Elastic SIP setup; LiveKit docs have a Twilio walkthrough; fallback = test inbound first to prove pipe works |
| `livekit-plugins-sarvam` is stale / lags Sarvam API | Medium | Blocks Sarvam-primary goal | Phase 3 confirms latest version + supported models; fallback = wrap Sarvam HTTP API in a custom LLM plugin (~50 LoC) |
| LiveKit Cloud free tier too small for pilot + dev | Low | Cost spike to ~$5 | Verify free-tier minutes in Phase 3; pilot only needs ~25 min |
| Sarvam Bulbul v3 latency over Twilio US trunk > 1.5s P95 | Medium | Operator perceives regression vs Vapi | Already a known Vapi issue too (transoceanic); A/B isolates whether LiveKit makes it worse; not a blocker to migrate |
| Silero VAD false-positives on slow-speaking elderly | Medium | NO_ANSWER mislabel | Tunable threshold; start permissive, log raw audio for analysis |
| Admin UI scope creeps into a real product | High (self-inflicted) | Wastes pilot time | Hard cap: edit-prompt + edit-first-message + edit-variables only. No auth, no multi-user, no history — Phase A scope |
| Promptfoo cannot evaluate voice agent (text-only) | High | Eval scenarios run on text simulation, not real calls | Accept text-eval as a regression smoke test (catches "did the prompt break the dialogue tree?"); voice-quality eval stays manual via the browser client |
| Langfuse Cloud free tier rate-limits at 50k events/mo | Low at pilot scale | Drops traces | Pilot is ~25 calls = trivial; Phase A 5,160 calls/mo well under 50k |
| Two-stack A/B confuses Day-10 synthesis | Medium | Mixed verdict | Pre-commit to A/B decision rules above (LiveKit must match-or-beat on all 4 axes) |
| Vapi assistant config rot during A/B | Low | Vapi side drifts and we compare apples to oranges | Freeze Vapi prompt at the v4 we land at end of Day 2; LiveKit prompt = same string, ported character-for-character |

---

## 9. Acceptance criteria (binary, testable)

Migration is **complete** when **all** of these hold. Phase 5 verifies each:

| # | Criterion | Test |
|---|---|---|
| 1 | LiveKit Agent answers a call placed to +918104348262 in Hindi | Shubh's phone rings, picks up, hears greeting |
| 2 | Sarvam STT + Sarvam TTS + Sarvam-M LLM all in the path | Langfuse trace shows all three providers per turn |
| 3 | End-of-call event reaches Apps Script and a row is appended to `call_logs` | Sheet has new row with `stack=livekit` and correct outcome |
| 4 | A PM (Shubh acting non-tech) can edit the prompt in admin UI and the next call uses the new prompt | Edit → save → dial → hear difference |
| 5 | A PM can open the browser test client, click Connect, and converse with the agent without a real call | Audio in/out works locally |
| 6 | Langfuse shows per-call: latency P50/P95, full transcript, audio URL, LLM cost in $ | Open trace UI, all 4 fields populated |
| 7 | Promptfoo runs 3 YAML scenarios and all 3 pass | `promptfoo eval` exit 0 |
| 8 | Silero VAD correctly classifies a voicemail recording as NO_ANSWER on a synthetic test | Manual test: dial voicemail-only number; outcome=NO_ANSWER |
| 9 | A/B outcome row count from Day 5 = (Vapi parents) + (LiveKit parents) with `stack` column populated | Sheet query |

---

## 10. Open decisions to surface (Phase 6)

| # | Decision | Recommended | Why |
|---|---|---|---|
| 1 | LiveKit Cloud vs self-host | **Cloud for migration; plan self-host path for Phase A DPDP** | Cloud is fastest path now; DPDP audio-in-India will force self-host later but not blocker today |
| 2 | Cut over or A/B | **A/B for pilot Days 5-9** | Per §7 — preserves pilot signal, gives real comparison |
| 3 | Prompt storage | **YAML file in repo (admin-UI reads/writes the file)** for pilot; **Supabase row** for Phase A | Pilot has 1 prompt + 1 operator → file is enough and zero-infra; Phase A multi-prompt + audit → DB |
| 4 | Admin-UI framework | **Streamlit + YAML** for pilot; **Next.js + Supabase** for Phase A | Streamlit = 1 file, no auth, runs locally, zero design work — matches pilot timeline |

---

## 11. Out of scope for this migration

- Multi-language activation (Phase B trigger)
- DPDP OTP proxy consent flow (Phase C)
- Exotel migration (Phase A)
- Production scale to 50 parents (Phase A)
- Auth on admin UI (single operator, local-only during pilot)
- Hosting admin UI on the public internet (Vercel/Render is Phase A)
- Rebuilding the Vapi assistant — Vapi stays live as fallback through pilot

---

## 12. What the build phases output

| Phase | File(s) produced |
|---|---|
| Phase 2 | Updated `voiceagent/docs/2026-06-15-medicall-prd-trd.md` (LiveKit-primary + CHANGELOG entry) |
| Phase 3 | `voiceagent/docs/research/livekit-cloud-pricing.md`, `livekit-plugins-sarvam.md`, `livekit-twilio-sip.md`, `dx-stack-langfuse-promptfoo-adminui.md`, `silero-vad-voicemail.md` |
| Phase 4a | `voiceagent/livekit/{agent.py,requirements.txt,Dockerfile,.env.example,README.md}` |
| Phase 4b | `voiceagent/docs/livekit-provisioning-and-twilio-sip.md` |
| Phase 4c | `voiceagent/scaffolds/webhook_v2.gs` (LiveKit payload) |
| Phase 4d | `voiceagent/admin-panel/{app.py or pages/*,prompts.yaml,README.md}` |
| Phase 4e | `voiceagent/livekit/langfuse_integration.py`, `voiceagent/evals/{scenario1,scenario2,scenario3}.yaml`, `voiceagent/evals/promptfoo.yaml` |
| Phase 4f | `voiceagent/livekit/voicemail_detector.py`, `voiceagent/browser-test/{index.html,client.js}`, `voiceagent/docs/2026-06-16-livekit-day1-runbook.md` |
| Phase 5 | Test-call evidence (Langfuse trace link + Sheet row screenshot + transcript) |
| Phase 6 | Decisions captured in updated PRD/TRD §Open Decisions |

---

*End of migration plan v1. Awaiting Shubh approval before Phase 2 (PRD/TRD update).*
