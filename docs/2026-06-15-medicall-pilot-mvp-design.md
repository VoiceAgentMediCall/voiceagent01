# MediCall AI — Pilot MVP Design Spec

**Date:** 2026-06-15
**Status:** Locked, awaiting `/plan`
**Owner:** Shubh
**Parent doc:** `MediCall_AI_MVP_Master_Plan (Repaired).docx`

---

## One-line summary

A 5-10 day, ~₹0 pilot that tests **one** riskiest assumption from the master plan: *will an elderly Hindi-speaking parent answer an AI voice call about their medication, and engage with it long enough to give a usable yes/no?*

## Why this exists

The master plan is a Phase-A-as-MVP spec that bundles 9 vendors, OCR, dashboards, escalation chains, multi-language, and DPDP compliance into one "MVP". The April-2026 survey of 43 caregivers showed the demand-side assumption is **not yet validated** (most respondents do nothing about medication today, most haven't tried solutions, willingness-to-pay is unproven). Before building the full stack, we shrink the bet to the smallest engineering effort that produces real behavioral evidence on the technical hypothesis: *can an AI voice call in Hindi succeed at the core confirmation loop with a real elderly Indian user?*

If parents engage well, the master plan resumes with confidence. If they hang up or can't navigate the dialogue, no amount of dashboard polish or vendor onboarding would have saved the product.

---

## In scope (what we build in 5-10 days)

1. **One Vapi assistant** configured in Hindi, with Sarvam Saaras (STT) and Sarvam Bulbul v3 (TTS) plugged in as custom providers, using Sarvam-105B as the LLM (fallback: GPT-4o-mini if Sarvam LLM integration has friction).
2. **One Twilio +91 outbound number** ($15.50 trial credit), pre-verified against the 5 pilot parents' phone numbers.
3. **A Google Sheet** with two tabs:
   - `schedule`: 5 rows, fields `parent_name`, `phone_e164`, `drug_name`, `dose_time`, `language=hi`
   - `call_logs`: appended one row per call, fields `timestamp`, `parent_name`, `outcome`, `transcript_excerpt`, `duration_sec`
4. **A manual trigger flow**: Shubh clicks "Dial" in the Vapi dashboard at each scheduled time (5 calls/day × ~5 days = ~25 calls total). Manual triggering is deliberate — it lets us watch every call live and iterate the prompt between attempts.
5. **A webhook handler** that receives Vapi end-of-call events and appends one row per call to the `call_logs` tab. Implemented as a Google Apps Script Web App bound to the same Sheet.
6. **A bare-bones dialogue tree** (full script in §Dialogue below). Three terminal outcomes only: `CONFIRMED`, `DENIED`, `NO_ANSWER`. No deferral, no side-effect path, no retry chain.
7. **A manual daily WhatsApp recap** from Shubh to each of the 5 caregivers ("Aaj aapki maa ne dawai li / nahin li") — Shubh's finger, not an API.

## Out of scope (parked from master plan — revisit post-pilot)

- Multi-language (Odia, Bengali, Tamil, Telugu, Malayalam) — Hindi only for pilot
- OCR (Veryfi or otherwise) — manual schedule entry into Google Sheet
- 3-strike retry chain, deferral path, side-effect path — not in dialogue
- Side-effect / red-team / hallucination escalation — single happy-path script only
- Caregiver web dashboard — Google Sheet is the only "UI"
- Caregiver auth, JWT, Supabase, Render, Vercel, QStash — none of it
- DPDP digital proxy consent OTP flow — replaced with verbal consent from caregiver (warm contacts only; pilot data deleted post-pilot)
- WhatsApp Business API (Twixor / Plivo / Gupshup / WATI) — manual WhatsApp from operator
- Admin dashboard, escalation log, hallucination review queue
- Drug-name validation against Apollo / 1mg DB
- Landing page / smoke test / waitlist — explicitly dropped 2026-06-15 (revisit when engagement is validated)
- Razorpay / payment integration
- Auto-purge / data minimization scripts (pilot data deleted by hand after pilot ends)
- **Exotel telephony — deferred to scale phase** (see §Telephony Decision below)

## Goal of pilot

By Day 10, we have **observed evidence** on each of these questions:

| Question | Pass threshold (rough) | How measured |
|---|---|---|
| Do parents pick up an unknown +91 number from an AI? | ≥ 3 of 5 parents answer at least 1 call | Twilio + Vapi call log |
| Does Sarvam Saaras transcribe their Hindi accurately enough to capture intent? | WER < ~10% on confirmation phrases ("haan", "le liya", "nahin", "abhi nahi") | Manual review of transcripts vs audio |
| Does Sarvam Bulbul v3 TTS feel natural / non-robotic enough that parents engage? | Anecdotal — no parent hangs up immediately on hearing the voice | Listen to recordings |
| Does the bare-bones script complete in < 60 seconds with a clean `CONFIRMED` / `DENIED` outcome? | ≥ 70% of answered calls reach a terminal state cleanly | call_logs sheet |
| Is end-to-end Vapi + Sarvam + Twilio latency acceptable (no awkward pauses)? | P95 turn latency < ~1.2s (master-plan target is 800ms; relaxed for pilot to account for Twilio transoceanic routing) | Vapi analytics |

**This pilot does NOT validate:** willingness to pay, OCR usability, multi-language quality, dashboard UX, retention beyond 5 days, production-scale carrier infrastructure.

---

## Architecture (single sentence)

`Google Sheet (5 rows) → Shubh's finger → Vapi dashboard (Dial) → Vapi orchestration (with Sarvam STT/TTS/LLM plugged in as custom providers) → Twilio outbound trunk → Parent's mobile → Vapi webhook → Google Apps Script Web App → Google Sheet (call_logs tab).`

No backend server. No database other than Sheets. No cron. No queue.

## Stack table

| Layer | Tool | Cost in pilot | Status / notes |
|---|---|---|---|
| Orchestration | **Vapi.ai** | $0.05/min × ~12 min total ≈ $0.60 | Account exists. Browser UI assistant config. |
| STT | **Sarvam Saaras (Hindi)** | ₹30/hr × ~0.2 hr ≈ ₹6 (covered by ₹1,000 signup credit) | Account exists. Plug in via Vapi "custom provider" config. |
| TTS | **Sarvam Bulbul v3 (Hindi)** | ₹30/10K chars × ~5K chars total ≈ ₹15 (covered) | Same Sarvam account. |
| LLM | **Sarvam-105B (free per token)** | ₹0 | Or fall back to **OpenAI GPT-4o-mini** if Sarvam LLM integration friction. |
| Telephony | **Twilio (+91 outbound)** | $0.0496/min × ~12 min ≈ $0.60 (inside $15.50 trial) | **To be created.** KYC: verify each of 5 parent numbers as "verified caller IDs" during trial. Exotel deferred — see §Telephony Decision. |
| Schedule DB | **Google Sheet** | ₹0 | One tab `schedule`, one tab `call_logs`. |
| Trigger | **Manual** (Shubh clicking Dial in Vapi dashboard) | ₹0 | Watching each call live is a feature, not a bug, in pilot. |
| Outcome logging | **Vapi webhook → Google Apps Script Web App** | ₹0 | Vapi end-of-call event POSTs JSON → Apps Script appends row to `call_logs`. |
| Caregiver alert | **Shubh on WhatsApp** | ₹0 | Daily recap message per caregiver, hand-written. |

**Total pilot out-of-pocket: ~$1.20 (covered by Twilio trial + Sarvam credit).**

## Telephony decision: Twilio for pilot, Exotel deferred to scale

The master plan picked Exotel for India-native latency (<50ms vs Twilio's 200-800ms transoceanic), 30-40% cheaper per-minute, and native TRAI/DLT compliance. Those reasons remain valid — **for production scale**. For *this pilot specifically*:

- Exotel signup is sales-led ("Talk to an Expert" CTA, enterprise quotes via hello@exotel.com per their public pricing page), likely requires Indian company KYC, and probably eats 2-5 days of our 5-10 day window before access is granted.
- Pilot total airtime is ~12 minutes. Cost difference between carriers is <$1.
- Pilot parents are 5 warm contacts with verbal consent — TRAI/DLT enforcement risk is essentially nil at this scale.
- Twilio is self-serve with $15.50 trial credit and instant API key.

**Decision:** Use Twilio for the pilot to maximize time spent on the actual engagement test. Begin Exotel onboarding as a parallel post-pilot task. The pilot's failure-mode analysis will explicitly flag whether Twilio latency contaminated the engagement signal — if so, the production switch to Exotel becomes a P0 ahead of any other scaling work.

## Dialogue (full script, Hindi)

The Vapi assistant system prompt enforces ONE happy path and explicit guardrails:

```
You are MediCall, a polite AI voice assistant calling an elderly patient in India
to confirm they have taken their scheduled medication. Speak in clear, simple Hindi.
Speak slowly. Use the patient's name. Be warm but brief.

GUARDRAILS — HARDCODED, NEVER VIOLATE:
- NEVER recommend, alter, or comment on dosage, timing, or drug names.
- NEVER diagnose any symptom.
- NEVER suggest stopping or starting medication.
- If the patient mentions any symptom or side effect, respond once with empathy,
  tell them to consult their doctor, and END THE CALL. Do not continue probing.
- ALWAYS keep the call under 90 seconds.

CALL FLOW:
1. Greet: "Namaste [PARENT_NAME] ji, main MediCall se bol raha hoon. Aapka
   [DRUG_NAME] lene ka samay ho gaya hai. Kya aapne le liya hai?"
2. If yes (Haan / le liya / ho gaya): "Bahut achha. Apna khayal rakhiyega. Dhanyavaad."
   → END CALL → outcome=CONFIRMED.
3. If no (Nahi / abhi nahi / bhool gaya): "Theek hai. Kripya jaldi le lijiye.
   Apna khayal rakhiyega."
   → END CALL → outcome=DENIED.
4. If unclear after 2 attempts to clarify: "Theek hai, dhanyavaad. Namaste."
   → END CALL → outcome=DENIED (logged as unclear).
5. If silence > 8 seconds at any point: end the call → outcome=NO_ANSWER.
```

Three terminal outcomes only: `CONFIRMED`, `DENIED`, `NO_ANSWER`. The webhook maps to these explicitly.

---

## Success criteria

Pilot is a **PASS** if all three hold:
1. ≥ 3 of 5 parents answer at least one call across the pilot window.
2. ≥ 60% of answered calls reach a clean terminal state (CONFIRMED or DENIED) without the script breaking down (hallucination, gibberish, infinite loop).
3. Zero guardrail violations: no medical advice, no dose alteration, no drug-name changes in any transcript.

Pilot is a **FAIL** (signal to pivot or rethink) if:
- Most parents hang up within 10 seconds of hearing the AI voice
- STT/TTS produces unintelligible Hindi
- Latency makes the conversation feel broken (and we can attribute it to carrier, not Vapi/Sarvam)

Pilot is **INCONCLUSIVE** (run another round before deciding) if signals are mixed.

## Risks & unknowns

| Risk | Likelihood | Mitigation |
|---|---|---|
| Twilio trial blocks +91 outbound or requires Indian KYC | Medium | Day 0 spike: register Twilio, verify 1 number, place 1 test call. If blocked, fall back to Plivo $10 trial credit. |
| Vapi ↔ Sarvam custom-provider integration has undocumented friction | Medium | Day 1 task is end-to-end "hello world" call with Sarvam plugged in. If blocked at end of Day 1, fall back to OpenAI Realtime in Hindi for the pilot (lower quality but unblocks the test). |
| Sarvam-105B free LLM is rate-limited or has latency spikes | Low-Medium | Fallback: GPT-4o-mini for LLM, keep Sarvam for STT/TTS only. |
| Twilio transoceanic latency contaminates the engagement signal | Medium | Record P95 latency Day 1; if > 1.5s, flag in pilot writeup and don't conclude "engagement failed" prematurely. |
| Parents refuse / are confused / blame the family for "scam call" | Medium-High | Caregiver pre-briefs each parent the day before: "kal MediCall ka phone aayega, woh AI hai, mera prototype hai, please uska jawab dijiye." |
| Dialect mismatch: parent answers in heavily-accented Hindi or code-mixed | Medium | Sarvam Saaras is explicitly built for this; if WER is high, log the failure mode and iterate prompt. |
| Pilot data leaks (transcripts in Google Sheet) | Low | No real medical conditions stored — only generic drug-name reference. Sheet access restricted to operator. Delete all data after pilot. |

## Constraints & assumptions

- Single operator (Shubh). No engineer hired for pilot.
- All 5 parents have given verbal consent (via their adult-child caregiver) to receive the test call.
- All 5 phones are GSM mobiles reachable via Twilio outbound; numbers will be Twilio-verified during trial setup.
- Pilot runs in IST mornings (9-11 AM) to maximize pickup probability.
- Total budget cap: ₹500 (well above expected ~₹100 spend).
- Sarvam account already exists; Vapi account already exists. Twilio account is the only new signup required.

## Open decisions deferred

1. **What happens after pilot ends?** If PASS, the next sprint is the demand test (landing page + paid pre-order). If FAIL, the next sprint is dialogue iteration with the same 5 parents.
2. **DPDP compliance UX validation** (OTP relay between parent and caregiver) — deferred to first post-pilot sprint, since pilot uses warm verbal consent.
3. **Choice of WhatsApp Business vendor** (Twixor, Plivo, Gupshup, WATI) — deferred. Pilot uses Shubh-on-WhatsApp.
4. **Whether to keep Vapi or migrate to LiveKit Agents post-pilot** — re-decide once we know how much custom dialogue logic the production product needs.
5. **Exotel onboarding timeline** — deferred to post-pilot, but caregiver should send an introductory email to hello@exotel.com on Day 1 of pilot in parallel, so onboarding can begin while pilot runs.

---

## What the `/plan` step will produce next

A day-by-day implementation plan covering:
- **Day 0:** Twilio account creation + KYC + +91 trial number provisioning, parent-number verification, Sarvam credit activation check, Vapi assistant scaffold created.
- **Day 1:** Vapi + Sarvam custom-provider wiring + "hello world" end-to-end test call to Shubh's own number.
- **Day 2:** Hindi prompt + dialogue tree wired into the Vapi assistant + test calls.
- **Day 3:** Google Apps Script Web App webhook + `call_logs` sheet integration + test call writing a row.
- **Day 4:** Pre-brief calls/WhatsApps to each of 5 caregivers, each caregiver pre-briefs their parent.
- **Day 5-9:** Pilot calls + nightly transcript review + prompt iteration between calls.
- **Day 10:** Synthesis writeup → PASS / FAIL / INCONCLUSIVE decision.

A separate `/prd` step will then formalize this pilot plus the master-plan roadmap into a PRD+TRD document covering pilot → Phase A → Phase B → Phase C with all parked items sequenced.
