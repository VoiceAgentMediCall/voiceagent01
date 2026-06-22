# MediCall AI — Combined PRD + TRD

**Date:** 2026-06-15
**Status:** Draft v2 — LiveKit promoted to primary orchestrator (2026-06-15 PM)
**Owner:** Shubh
**Parent docs:**
- `docs/2026-06-15-medicall-pilot-mvp-design.md` (locked pilot spec)
- `docs/2026-06-15-livekit-migration-plan.md` (LiveKit migration plan, v2 driver)
- `master_plan.txt` (original 9-vendor Phase A plan)
- `survey_responses.txt` (43 caregiver responses, Apr-May 2026)
- `validation_doc.txt` (Mom Test / JTBD / Wizard-of-Oz framework)

---

## CHANGELOG

### v4 — 2026-06-16 (Phase A/B/C re-prioritization flag — NOT YET RE-WRITTEN)

- **Status:** PRD content unchanged from v3. This entry is a **flag**, not a rewrite.
- **What triggered the flag:** Realtime build session 2026-06-16 surfaced that (a) the "function that joins everything" (Phase A backend) is the actual product spine — voice is one of N dependencies, not centerpiece; (b) Shubh raised calendar integration which isn't scoped in v3; (c) Claude has direct MCP access to Supabase / Vercel / Google Calendar / GitHub / Notion / Gmail but NOT to Vapi / LiveKit / Sarvam / Langfuse / Twilio — biases what's cheap to build; (d) some current pieces (Streamlit admin-panel, browser-test, evals) may benefit from consolidating into one Next.js+Vercel app earlier than Phase A originally planned; (e) 3 known bugs (rigid prompt, no programmatic call-end, Langfuse trace not wired) held pending the Phase decision.
- **Required action before v5:** Phase A/B/C re-prioritization + scope adjustment. Re-evaluate (i) what enters Phase A vs Phase B vs deferred; (ii) calendar integration's phase home; (iii) admin-UI consolidation timing; (iv) what gets fixed in pilot vs Phase A.
- **Pilot timing impact:** Pilot Days 5-9 should NOT start until this re-prioritization is done (or explicitly decided to start as-is).

### v3 — 2026-06-15 PM (4 open decisions LOCKED by Shubh)

- Shubh approved all 4 recommendations from `2026-06-15-phase6-open-decisions.md` verbatim.
- **Decision 1 LOCKED:** LiveKit **Cloud** for migration; self-host migration planned for Phase A when DPDP forces audio-in-India.
- **Decision 2 LOCKED:** **A/B** for pilot Days 5-9. Parents 1-3 → Vapi, Parents 4-5 → LiveKit. Same prompt. Cutover decided at Day-10 synthesis based on match-or-beat on voice/latency/outcome/transcript.
- **Decision 3 LOCKED:** Prompt storage = **YAML file** (`voiceagent/admin-panel/prompts.yaml`) for pilot. Supabase row migration at Phase A kickoff.
- **Decision 4 LOCKED:** Admin-UI framework = **Streamlit** (built in `voiceagent/admin-panel/`) for pilot. Next.js + Supabase at Phase A.
- All 4 are now removed from "Open Decisions Deferred" and added to "Closed Decisions" history.

### v2 — 2026-06-15 PM (LiveKit promotion)

- **Architecture decision changed:** LiveKit Agents + Sarvam is now the **primary** orchestrator for Phase A onward. Vapi becomes the **fallback/A-B baseline** for pilot Days 5-9 only.
- **Driver:** Vapi has no native Sarvam STT/TTS (confirmed via API error). LiveKit ships `livekit-plugins-sarvam` natively. Phase B (Odia/Bengali/Tamil/Telugu/Malayalam) is infeasible on Vapi at Sarvam-Bulbul-v3 quality.
- **Cost impact:** Phase A monthly run-rate drops from ~$670 to ~$413 (-38%) at 50-parent scale.
- **Closes Open Decision #4 ("Vapi vs LiveKit")** below in the affirmative for LiveKit.
- **Opens 3 new open decisions** captured in `livekit-migration-plan.md §10` and refreshed in §Open Decisions below.
- **No change** to pilot architecture (§TRD 1) — pilot ran on Vapi and that record is preserved.
- **Phase A architecture (§TRD 2), webhook contract (§TRD 3.1), cost model (§TRD 6), fallback paths (§TRD 7)** are now superseded by `livekit-migration-plan.md` until those sections are rewritten in v3. Refer to the migration plan for current primary; the original Vapi-primary text below is kept for diff/audit until v3.

### v1 — 2026-06-15 AM (initial)

- Synthesized from pilot design spec + master plan + 43-caregiver survey + validation framework.

---

# Part 1 — Product Requirements Document (PRD)

## 1. Problem Statement

**Who suffers:**
- Elderly Indian parents (60+) on chronic-disease polypharmacy regimens (T2DM, hypertension, heart conditions, thyroid, arthritis, depression). Median patient takes 2-5 medicines/day; 6+ for the polypharmacy tail.
- Adult-child caregivers (28-45), economically separated from parents by migration, carrying the cognitive and emotional load of "did Mum take her BP tablet today?" across a time zone or city gap.

**What evidence:**
- Pooled prevalence of medication non-adherence among Indian chronic-disease patients ≈ **48%** (systematic review of observational data 2020-2025, cited in master plan §Context).
- Our own 43-respondent survey (Apr-May 2026):
  - 32 of 43 (74%) report parents need regular medicines/health reminders.
  - **22 of 32 (~69%) of engaged caregivers report "I did nothing, they manage it themselves"** as their actual last-7-days behaviour — the demand-side pain is felt but rarely acted on.
  - 7 of 32 reported "Once or twice missed" in past 30 days; 6 reported "I do not actually know" (the blindness itself is the pain).
  - 6 of 32 confirmed hospitalisation or ER from missed/wrong meds in the past year — the catastrophic tail is real.
  - **0 of 32 are currently using a working software solution.** Most never tried; the few who tried stopped because "parent did not use it consistently."

**What breaks today:**
- WhatsApp pings, phone alarms, and pillboxes all require the parent to operate a smartphone or remember to look at a box. Cognitive friction and presbyopia eliminate the smartphone path for the 60+ demographic.
- Adult-child caregivers run out of time-of-day attention windows during corporate hours and stop reminding — guilt accumulates, intervention happens only post-event (post-hospitalisation, post-doctor-visit).
- No existing product reaches the parent through their actual daily interface (the cellular phone) in their actual language (Hindi, Bengali, Odia, Tamil, Telugu, Malayalam, Gujarati) with a stateless, dignity-preserving check-in.

---

## 2. User — Primary Persona

**Riya, 33, Senior PM at a Bangalore SaaS company.**
- Born in Bhubaneswar; parents (66 and 70) live there. Father has T2DM + hypertension on 4 medicines/day. Mother has thyroid + arthritis on 2 medicines/day.
- Riya's day: 9:30 AM standup → back-to-back meetings until 7 PM. Her morning "did you take your tablet?" WhatsApp gets sent ~3 days out of 7. The other 4 days she remembers at 11 PM and feels guilty.
- Father uses a basic Android with WhatsApp and the dialer; mother prefers a feature phone, calls are her only digital interface.
- Last serious adherence event: father skipped his BP tablet for 4 days during a festival visit to his sister's house and was admitted with a spike to 180/110. Riya found out from her aunt, not her father.
- What Riya is "hiring" the product to do (JTBD): *eliminate the anxiety of not knowing*. Not "automate reminders" — **verified peace of mind**, with the parent's dignity intact.
- What Riya's father is "hiring" the product to do (JTBD): *let me stay independent*. Not "be monitored by my daughter" — a polite phone check-in he can dismiss in 30 seconds, in Hindi or his preferred regional language.

**Secondary persona (Phase B):** Caregivers of non-Hindi-speaking parents — the survey shows Odia (5), Bengali (3), Gujarati (7), Tamil/Telugu (1), Konkani (4), Marathi (1) — Hindi-only coverage strands roughly one-third of the demand.

---

## 3. Demand Evidence — 43-Caregiver Survey Key Findings

| Finding | Number | Implication |
|---|---|---|
| Caregivers whose parents need medicine reminders | 32 of 43 (74%) | The "do they need it?" question is settled. |
| Caregivers currently doing nothing systematic | ~22 of 32 (69%) | The "do they act on it?" question is wide open. Latent pain, not active pain. |
| Caregivers who never tried any solution | ~21 of 32 (66%) | Greenfield market — but also a signal: the pain isn't yet sharp enough to drive search behaviour. |
| Caregivers whose parents were hospitalised/ER'd from med issues | 6 of 32 (19%) | Catastrophic tail exists and is salient enough to recall. |
| Caregivers who do not actually know if doses were missed | ~10 of 32 (31%) | The *blindness* is itself the JTBD — "I don't know" is the anxiety being sold against. |
| Parents on basic feature phone or struggling smartphone | ~12 of 32 | Validates the "zero-interface PSTN voice call" architecture choice. |
| Primary language NOT Hindi | ~17 of 32 (53%) | Hindi-only product addresses only half the surveyed market — Phase B multi-language is not optional. |
| Caregivers paying for daily care help today | 9 of 32 (28%) | Willingness to pay exists in the segment paying ₹5k-10k+ for live-in or visit caregivers. |
| Caregivers willing to do a 10-min follow-up call | ~15 of 32 (47%) | Warm pool exists for pilot recruitment and Wizard-of-Oz tests. |

**Critical caveat surfaced by validation doc:** survey self-report ≠ behavioural truth. Caregivers say "I would care about this" — they do not yet *behave* like they care. **The pilot exists specifically to convert the demand-signal from stated to behavioural** before Phase A scale.

---

## 4. Metrics — Per-Phase Success Criteria

### Pilot (Engagement Test, 5-10 days, 5 parents)

| Metric | Target | Why this number |
|---|---|---|
| Parents who answer ≥1 call | ≥ 3 of 5 (60%) | Basic "does an AI call get picked up at all?" sanity check. |
| Answered calls reaching CONFIRMED/DENIED cleanly | ≥ 60% | Dialogue actually completes — no break-down, hallucination, or infinite loop. |
| Guardrail violations (medical advice, dose alteration) | 0 | Zero-tolerance per master plan §1.3 guardrails. |
| Sarvam Saaras WER on confirmation phrases | < ~10% | Pilot-relaxed from master plan's <5% production target. |
| P95 turn latency | < 1.2s | Pilot-relaxed from master plan's <800ms (accounts for Twilio transoceanic routing). |

### Phase A (Production Scale, 50 Parents, Exotel)

| Metric | Target | Source |
|---|---|---|
| Task Completion Rate (TCR) | > 85% | Master plan §1.4 |
| Word Error Rate (WER) on confirmation intent | < 5% | Master plan §1.4 |
| Turn latency P95 | < 800ms | Master plan §1.4 (now achievable with Exotel India-local routing) |
| Hallucination rate | < 0.1% | Master plan §1.4 — zero-tolerance retained |
| Call abandonment rate | < 10% | Master plan §1.4 |
| 7-day adherence streak retention (proxy for caregiver retention) | ≥ 50% of dyads still active at Day 30 | New metric — pilot only proved engagement, not stickiness |
| Caregiver-reported anxiety reduction | Self-report Likert ≥ 4/5 in 60% of dyads at Day 30 | JTBD validation — proves we sold "peace of mind" not "infra" |

### Phase B (Multi-language Coverage)

| Metric | Target |
|---|---|
| Languages live in production | Hindi + Odia + Bengali + Tamil + Telugu + Malayalam (6 total) |
| WER per non-Hindi language | < 8% (relaxed from Hindi <5% to reflect Sarvam model maturity) |
| Dyads onboarded with non-Hindi primary language | ≥ 40% of total active dyads — validates "Hindi-first" was not "Hindi-only" |
| Code-mixed input handled (e.g., "haan le liya, abhi busy hoon") | ≥ 90% correct intent classification |

### Phase C (Revenue / Full Vendor Stack)

| Metric | Target |
|---|---|
| Paying dyads | 200+ |
| Monthly Recurring Revenue (MRR) | ₹3,00,000+ (at ~₹1,500/dyad/month) |
| Unit economics | Gross margin > 50% per dyad after vendor costs |
| OCR auto-approval rate | > 80% (caregiver accepts Veryfi extraction without edits) |
| Side-effect escalation false-positive rate | < 5% (escalation reviewed manually; was the alarm warranted?) |
| DPDP OTP proxy-consent completion rate | > 90% of caregivers complete the bind step within 24h |
| Razorpay payment success rate | > 95% on first attempt |

---

## 5. MVP Scope — The Pilot (Engagement Test Only)

The MVP is **not** the master plan's Phase A. The MVP is the lean pilot already locked in `docs/2026-06-15-medicall-pilot-mvp-design.md`.

**In scope:**
1. One Vapi assistant configured in Hindi.
2. Sarvam Saaras STT + Sarvam Bulbul v3 TTS + Sarvam-105B LLM (fallback GPT-4o-mini) wired via Vapi custom providers.
3. One Twilio +91 outbound trunk (trial credit covers all 25 pilot calls).
4. Google Sheet with `schedule` and `call_logs` tabs.
5. Manual trigger: Shubh clicks Dial in Vapi dashboard at each scheduled time (deliberate — lets him iterate the prompt between calls).
6. Google Apps Script Web App webhook that receives Vapi end-of-call event and appends one row per call to `call_logs`.
7. Bare-bones 3-outcome dialogue: `CONFIRMED` / `DENIED` / `NO_ANSWER`. No deferral, no retry, no side-effect path.
8. Manual daily WhatsApp recap from Shubh to each of 5 caregivers.

**The MVP is a Wizard-of-Oz / smoke-test hybrid.** Per validation doc, before committing to backend infrastructure (Supabase, Render, QStash), we test the riskiest assumption: *will an elderly Hindi-speaking parent engage with the AI voice call*. Everything else in the master plan is gated on this passing.

**Total pilot out-of-pocket: ~$1.20.** Covered by Twilio trial credit + Sarvam signup credit.

---

## 6. Roadmap — Pilot → Phase A → Phase B → Phase C

### Pilot (Days 0-10) — Engagement Validation

Already locked. See §5 above and `2026-06-15-medicall-pilot-mvp-design.md`. Goal: PASS/FAIL/INCONCLUSIVE decision by Day 10.

### Phase A (Months 1-2) — Production Scale to 50 Parents on Exotel

**Trigger to start:** Pilot returns PASS.

**Scope additions over pilot:**
- **Telephony swap:** Twilio +1 → **Exotel +91** SIP trunk. India-local <50ms media latency, TRAI/DLT compliant, native caller ID. Exotel onboarding (sales-led, KYC) was kicked off Day 1 of pilot so it's ready when Phase A begins.
- **Data store swap:** Google Sheet → **Supabase Pro** ($25/mo). Postgres + Auth + RLS + Storage. Medical SPD under DPDP requires PITR backups — non-negotiable per master plan §2.4.
- **Orchestration backend:** Bare Vapi dashboard → **Render Starter** ($7/mo, always-on) Node.js + Fastify API. Receives Vapi webhooks, writes to Supabase, fires escalations. Always-on so Vapi webhooks during live calls don't hit a sleeping server.
- **Scheduling:** Manual Dial click → **Upstash QStash** durable cron with exponential-backoff retries (5s → 15s → 1min). If Vapi API is momentarily down, the job retries instead of silently dropping.
- **Three-strike retry chain:** Add 15-min and 30-min retry slots per master plan §A4.
- **Side-effect path:** Reintroduce the empathetic-acknowledge-and-escalate path from master plan §1.3.
- **Caregiver dashboard (read-only first):** Next.js on Vercel showing adherence streak calendar + call log + transcripts. No CRUD yet — caregiver still emails Shubh to change schedules.
- **Caregiver alert:** Manual WhatsApp from Shubh → **WhatsApp Business API** (Twixor or Plivo) automated escalation message.
- **Auth:** None → **Supabase Auth** email+password with OTP email verification, JWT session.

**Explicit gate:** Phase A still uses **Hindi only**. Multi-language is Phase B. Phase A is about proving the production stack works at 10x the pilot's scale and adding the retry/escalation/dashboard that the pilot deliberately skipped.

### Phase B (Months 3-4) — Multi-Language Coverage

**Trigger to start:** Phase A hits TCR > 85%, 50 dyads, ≥ 50% retention at Day 30.

**Scope additions:**
- **Languages live:** Odia, Bengali, Tamil, Telugu, Malayalam (Hindi already live from Phase A).
- **Sarvam Saaras + Bulbul v3 voices per language.** Sarvam advertises full coverage of these — validation spike on real audio samples per language is required before each goes live.
- **Per-patient language flag in `patients` table** (already in master plan §2.3 schema as `language`).
- **Dialogue script translated per language by native speakers** (not LLM-translated — JTBD doc emphasizes dialect and emotional tone).
- **Sentiment analysis on transcripts** (master plan Phase B item) — detect patient distress, repeated refusals, unusually short responses.
- **Multi-caregiver support** — one patient → up to 3 caregivers (primary + 2 backups). Important for joint families.
- **Snooze/reschedule from dashboard** — caregiver can defer a dose window from the web UI.
- **Caregiver dashboard CRUD** — full schedule edit, pause, delete, drug-add flows. No more "email Shubh to change a dose."

**Explicit gate:** Phase B does NOT add OCR, payments, or DPDP OTP. Caregiver still onboards via verbal consent + Shubh manually creating the schedule from a WhatsApp'd photo. The Phase B bet is *language reach*, not *acquisition automation*.

### Phase C (Months 5-9) — Full Vendor Stack, Monetisation, DPDP OTP

**Trigger to start:** Phase B has 5 languages live with WER < 8% across all of them, retention is holding, and we have at least 100 free dyads who would convert if asked.

**Scope additions:**
- **OCR onboarding:** **Veryfi Medical OCR API**. Caregiver uploads prescription photo → JSON draft → side-by-side review UI → approve. Master plan §A2.
- **Drug name validation:** Apollo Pharmacy Kaggle dataset + 1mg API cross-check. Flag unrecognized terms with suggestions. Master plan §A2.
- **DPDP proxy-consent OTP flow:** Exotel SMS sends OTP to parent's phone → caregiver inputs in dashboard → cryptographic bind. Per master plan §A1 and §2.5. This is the **first time the product is legally distributable beyond warm contacts**.
- **WhatsApp Business API for both escalation AND notification:** Successful-call recaps ("Dad took his BP tablet at 8:03 AM") + escalation alerts. Twixor or Plivo, decided after pilot.
- **Admin dashboard (Shubh + ops):** total users, daily calls answered/missed, TCR rolling 7-day, latency P95, transcript audit queue (5/day random), API spend per vendor, escalation log, hallucination review queue. Master plan §A6.
- **Razorpay payments:** Subscription billing layer. ₹1,000-₹2,000/dyad/month tiers TBD post-Phase-B pricing test.
- **Customisable AI persona tone:** Formal vs familial, per-patient. Master plan Phase B item moved to C because it depends on having multi-language + sentiment data live first.
- **Data minimization scripts:** Auto-purge raw audio + prescription images after 30 days. Per master plan §2.5 and DPDP.
- **Right-to-erasure UX:** Cascading delete across all tables + storage. DPDP §2.5.
- **DPAs signed** with Vapi, Sarvam, Veryfi, Exotel, WhatsApp vendor. Prohibits training-data use of any PII or audio.

---

## 7. Risks Per Phase + Mitigations

### Pilot Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Twilio trial blocks +91 outbound or demands Indian KYC | Medium | Day 0 spike: register + verify 1 number + test call. Fallback: Plivo $10 trial. |
| Vapi ↔ Sarvam custom-provider integration friction | Medium | Day 1: end-to-end "hello world" call. Fallback: OpenAI Realtime in Hindi (lower quality, unblocks test). |
| Sarvam-105B LLM rate-limited or latency spikes | Low-Medium | Fallback: GPT-4o-mini for LLM, keep Sarvam STT/TTS. |
| Twilio transoceanic latency contaminates engagement signal | Medium | Day 1: record P95. If > 1.5s, flag in writeup — don't conclude "engagement failed" prematurely. |
| Parents refuse / hang up / call it a scam | Medium-High | Caregiver pre-briefs parent in advance: "kal MediCall ka phone aayega, woh AI hai, mera prototype hai." |
| Dialect mismatch: heavily-accented or code-mixed Hindi | Medium | Sarvam is built for this; if WER high, log failure mode and iterate prompt. |
| Pilot data leaks (transcripts in Google Sheet) | Low | No real medical conditions stored — generic drug-name only. Sheet locked to operator. Manual delete after pilot. |

### Phase A Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Exotel onboarding stuck in sales/KYC > 2 weeks | Medium | Started Day 1 of pilot in parallel. If still stuck at pilot end, run Phase A on Twilio +91 (more expensive, no DLT cover) for the first 10 dyads while Exotel finalises. |
| Vapi webhook reliability at 50-dyad × 3-meds/day = 150 calls/day | Low-Medium | QStash retries already cover transient failures. Add Vapi webhook signature verification + idempotency keys on call-log writes. |
| TRAI DND complaints from a single user marking us as spam | Medium | Verbal consent + caregiver-initiated subscription mean we're not cold-calling. Document the consent trail per patient. Exotel DND scrubbing on by default. |
| Render Starter goes down or hits cold start despite "always-on" | Low | Vapi webhook with 5-retry exponential backoff means transient downtime < 1 min is invisible. Beyond that, paging Shubh's phone via Healthchecks.io. |
| Supabase RLS misconfigured → cross-tenant data leak | Critical if happens, Low likelihood | Write RLS tests as part of CI. Two-test-caregiver verification before each deploy. |
| DPDP audit before Phase C OTP flow ships | Low at 50-dyad scale | Verbal consent logged per dyad. If audited, demonstrate consent trail and stop new signups until OTP flow ships. |

### Phase B Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sarvam model quality varies across languages | High | Per-language spike before going live. Don't ship a language with WER > 8%. |
| Native-speaker dialogue translation introduces medical-meaning shift | Medium | Doctor or pharmacist review of every translated script before deployment. |
| Multi-caregiver permission model edge cases (custody disputes, divorced parents) | Low-Medium | Primary caregiver has ultimate add/remove authority. Backup caregivers are read-only by default; primary can grant write per backup. |
| Sentiment analysis flags too many false positives | Medium | Start with high-confidence threshold (e.g., 3 short refusals in a row before flagging). Tune from data. |

### Phase C Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Veryfi OCR accuracy < 90% on real Indian Rx | Medium | Validation spike with 20 real anonymized prescriptions before signing Veryfi contract. Fallback: Koncile (master plan §5.1). |
| DPDP OTP flow UX fails — parents don't share OTP with adult-child | Medium-High | Per validation doc §"Validating the Digital Proxy Consent Protocol" — this is the riskiest UX gate. Validate with 10 real dyads in Wizard-of-Oz before building. |
| WhatsApp Business account verification stuck > 5 days at Facebook | Medium | Start verification Day 1 of Phase C. Fallback: continue Plivo SMS for escalation. |
| Razorpay payment failures at scale | Low | Standard webhook + manual ops queue for first month. |
| Side-effect escalation false-positive rate > 5% causes alert fatigue | Medium | Manual review queue (5/day) tuned weekly. Threshold tightening based on caregiver feedback. |
| Apollo / 1mg drug DB licensing or rate-limit issues | Low-Medium | Cache the dataset locally for top 500 Indian generics; hit live API only for misses. |
| ₹1,500/month price point fails — caregivers cite "I can hire a maid for that" | Medium-High | Pre-Phase-C smoke test: landing page with pricing tier + "Sign Up Now" → waitlist. If conversion < 2% of qualified traffic, drop to ₹500 freemium + ₹1,500 premium tier. |

---

## 8. Out-of-Scope (Per Phase)

### Out of Scope for Pilot
- Multi-language (Odia, Bengali, Tamil, Telugu, Malayalam) — Hindi only
- OCR (Veryfi or any) — manual schedule entry into Google Sheet
- 3-strike retry chain, deferral path, side-effect path
- Hallucination escalation queue
- Caregiver web dashboard
- Caregiver auth, JWT, Supabase, Render, Vercel, QStash
- DPDP digital proxy consent OTP — verbal consent only
- WhatsApp Business API — manual WhatsApp from Shubh
- Drug-name validation against Apollo / 1mg
- Landing page / smoke test / waitlist
- Razorpay
- Auto-purge / data minimization scripts — manual cleanup
- Exotel — deferred to Phase A

### Out of Scope for Phase A
- Multi-language — Hindi only still
- OCR — caregiver WhatsApps a Rx photo, Shubh manually creates the Supabase schedule rows
- DPDP proxy-consent OTP — verbal consent with caregiver attestation in Supabase
- Razorpay — early dyads are free (lifetime founders' cohort)
- Sentiment analysis — Phase B
- Multi-caregiver support — one caregiver per patient
- Snooze/reschedule from dashboard — caregiver still emails operator
- Customisable persona tone
- Admin dashboard polish — operator uses raw Supabase studio
- Hallucination review queue UI — Shubh manually audits 5/day in transcript log
- Fine-tuned drug DB / Veryfi replacement

### Out of Scope for Phase B
- OCR (Veryfi) — still Phase C
- DPDP OTP — still Phase C
- Razorpay — still Phase C
- WhatsApp Business API — still Phase C (Plivo SMS escalation continues from Phase A)
- Drug DB validation — still Phase C
- Mobile app for caregiver — Phase C+
- Fine-tuned MLLM replacing Veryfi — Phase D
- Referral / subscription billing — Phase C

### Out of Scope for Phase C
- Fine-tuned MLLM (Qwen-VL on proprietary Rx dataset) replacing Veryfi — Phase D
- Mobile app (React Native) — Phase D
- Multi-language beyond the Phase B six (e.g., Marathi, Gujarati, Punjabi, Kannada, Konkani) — Phase D, driven by demand
- B2B / partnerships with hospitals or pharmacies — Phase D+
- Referral programme — Phase D

---

# Part 2 — Technical Requirements Document (TRD)

## 1. Pilot Architecture (Single Sentence)

`Google Sheet (5 rows) → Shubh's finger → Vapi dashboard (Dial) → Vapi orchestration with Sarvam Saaras STT + Sarvam Bulbul v3 TTS + Sarvam-105B LLM plugged in as custom providers → Twilio +91 outbound trunk → parent's mobile → Vapi end-of-call webhook → Google Apps Script Web App → Google Sheet (call_logs tab).`

### Diagram-as-text

```
+--------------------+     +---------------------------+
| Google Sheet       |     | Shubh's finger            |
| - schedule tab     |---->| (clicks Dial at scheduled |
| - call_logs tab    |     |  time in Vapi dashboard)  |
+--------------------+     +-------------+-------------+
        ^                                |
        |                                v
        |                  +-------------+-------------+
        |                  | Vapi.ai orchestration     |
        |                  |  - Sarvam Saaras STT      |
        |                  |  - Sarvam Bulbul v3 TTS   |
        |                  |  - Sarvam-105B LLM        |
        |                  |    (fallback GPT-4o-mini) |
        |                  +-------------+-------------+
        |                                |
        |                                v
        |                  +-------------+-------------+
        |                  | Twilio +91 outbound trunk |
        |                  +-------------+-------------+
        |                                |
        |                                v
        |                  +-------------+-------------+
        |                  | Parent's mobile (GSM)     |
        |                  +-------------+-------------+
        |                                |
        |                                v
        |                  +-------------+-------------+
        |                  | Vapi end-of-call webhook  |
        |                  +-------------+-------------+
        |                                |
        |                                v
        |                  +-------------+-------------+
        +------------------+ Google Apps Script Web App|
                           | (appends row to call_logs)|
                           +---------------------------+
```

**No backend server. No database other than Sheets. No cron. No queue. ~$1.20 total cost.**

---

## 2. Phase A Architecture

Replaces Twilio with Exotel, Sheets with Supabase, Shubh's finger with Render + QStash. Adds Vapi webhook signature verification, retry chain, side-effect escalation, and a read-only caregiver dashboard.

### Diagram-as-text

```
+--------------------+    +--------------------------+
| Caregiver browser  |--->| Next.js on Vercel        |
| (Riya, read-only)  |    | - login (Supabase Auth)  |
+--------------------+    | - adherence calendar     |
                          | - call log + transcripts |
                          +-----------+--------------+
                                      | REST
                                      v
+---------------------------------------------------+
| Render Starter ($7/mo, always-on)                 |
| Node.js + Fastify API                             |
|  - /api/schedules (CRUD-lite, operator-write)     |
|  - /api/webhooks/vapi (end-of-call ingest)        |
|  - /api/webhooks/qstash (fire-call trigger)       |
|  - /api/escalations (WA Business API outbound)    |
+--------+------------------+---------------+-------+
         |                  |               |
         v                  v               v
+----------------+   +---------------+   +--------------+
| Upstash QStash |   | Supabase Pro  |   | WhatsApp     |
| - durable cron |   | - Postgres+RLS|   | Business API |
| - exp backoff  |   | - Auth (JWT)  |   | (Plivo for   |
|   5s/15s/1min  |   | - Storage     |   |  Phase A)    |
+--------+-------+   +-------+-------+   +------+-------+
         |                   ^                  ^
         v                   |                  |
+----------------+           |                  |
| Vapi.ai outbound|----------+ (writes call_log,|
| - Sarvam Saaras |            updates schedule)|
| - Sarvam Bulbul |                             |
| - Sarvam-105B   |                             |
|   (fallback     |                             |
|    GPT-4o-mini) |                             |
+--------+-------+                              |
         |                                      |
         v                                      |
+----------------+                              |
| Exotel SIP     |                              |
| trunk +91      |                              |
| <50ms latency  |                              |
| TRAI/DLT       |                              |
+--------+-------+                              |
         |                                      |
         v                                      |
+----------------+                              |
| Parent mobile  +------------------------------+
| (GSM, India)   |    (escalation alert path)
+----------------+
```

**Trigger flow:** QStash fires at scheduled time → POSTs `/api/webhooks/qstash` on Render → Render calls Vapi outbound API with patient_id, drug, language → Vapi places call via Exotel → conversation runs → Vapi POSTs end-of-call webhook → Render writes `call_logs` row to Supabase → if outcome ∈ {`no_answer`, `escalated_side_effect`} after 3 attempts, Render fires WhatsApp Business API alert to caregiver.

---

## 3. API Contracts

### 3.1 Vapi End-of-Call Webhook Payload (Render `/api/webhooks/vapi` receives)

```jsonc
{
  "type": "end-of-call-report",
  "call_id": "vapi_call_uuid",
  "assistant_id": "vapi_assistant_uuid",
  "phone_number": {
    "twilio_phone_number": "+15551234567",   // pilot
    "exotel_phone_number": "+918048123456"   // Phase A
  },
  "customer": {
    "number": "+919876543210",                // parent's E.164
    "name": "Patient Name"
  },
  "started_at": "2026-06-15T03:30:00.000Z",   // ISO8601 UTC
  "ended_at":   "2026-06-15T03:30:42.123Z",
  "ended_reason": "customer-ended-call",      // or "assistant-ended-call", "no-answer", "twilio-failed", etc.
  "duration_seconds": 42.123,
  "transcript": "AI: Namaste ji... Patient: Haan le liya... AI: Bahut achha...",
  "summary": "Patient confirmed taking BP tablet.",
  "structured_outputs": {
    "outcome": "CONFIRMED",                   // CONFIRMED | DENIED | NO_ANSWER | ESCALATED_SIDE_EFFECT
    "patient_response_language": "hi",
    "guardrail_violations": []                 // empty array; any string here is a P0 alert
  },
  "metadata": {                                // passed in by caller at call-initiation
    "patient_id": "supabase_patient_uuid",
    "schedule_id": "supabase_schedule_uuid",
    "attempt_number": 1
  },
  "cost": {
    "vapi_cost_usd": 0.035,
    "stt_cost_inr": 0.50,
    "tts_cost_inr": 0.75,
    "llm_cost_inr": 0.00,
    "telephony_cost_inr": 0.45
  }
}
```

**Render webhook handler responsibilities:**
1. Verify Vapi signature header (HMAC-SHA256) — reject if invalid.
2. Idempotency: key on `call_id`; if duplicate, return 200 OK silently.
3. Map `structured_outputs.outcome` to Supabase `call_logs.outcome` enum.
4. If `outcome == NO_ANSWER` and `attempt_number < 3`: enqueue QStash retry at +15min (attempt 2) or +30min (attempt 3).
5. If `outcome == NO_ANSWER` and `attempt_number == 3`: fire escalation to caregiver.
6. If `outcome == ESCALATED_SIDE_EFFECT`: fire immediate high-priority escalation.
7. If `guardrail_violations.length > 0`: fire P0 alert to ops, flag transcript for hallucination review queue.

### 3.2 Apps Script Webhook Response (pilot only — Google Apps Script Web App)

The Apps Script doPost handler receives the Vapi payload above and responds:

```jsonc
// Success
{
  "ok": true,
  "row_id": 42,                    // sheet row appended
  "logged_at": "2026-06-15T03:30:43.500Z"
}

// Failure
{
  "ok": false,
  "error": "SHEET_WRITE_FAILED",   // or "INVALID_PAYLOAD", "DUPLICATE_CALL_ID"
  "message": "Quota exceeded on Sheets API",
  "retry_after_seconds": 60
}
```

Vapi treats any non-2xx as a webhook failure and retries per its default policy (up to 3 attempts with backoff). Apps Script's idempotency check is on `call_id` — if already in the sheet, return `ok: true` with the existing `row_id`.

---

## 4. Data Model — Phase A Entities

### `parent` (renamed from `patients` in master plan — clearer in code)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `caregiver_id` | uuid FK → caregiver.id | RLS scoping |
| `name` | text | Parent's name as used in greeting |
| `phone_e164` | text | E.164 format, +91XXXXXXXXXX |
| `language` | enum('hi','or','bn','ta','te','ml','en') | Hindi only in Phase A; rest reserved |
| `age_bracket` | enum('50-60','60-70','70-80','80+') | For analytics only |
| `phone_type` | enum('feature','smartphone_basic','smartphone_confident') | Drives expected call-handling friction |
| `consent_method` | enum('verbal','otp') | 'verbal' Phase A; 'otp' Phase C |
| `consent_verified_at` | timestamptz | Audit trail |
| `consent_otp_hash` | text (nullable) | NULL in Phase A; hash of OTP in Phase C |
| `active` | boolean | Soft-delete flag |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `caregiver` (Supabase Auth user maps 1:1 here)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK, = auth.uid() |
| `email` | text | Unique, from Supabase Auth |
| `name` | text | Display name |
| `whatsapp_e164` | text (nullable) | For escalation alerts in Phase A |
| `escalation_channel` | enum('whatsapp','email','both') | Default 'whatsapp' |
| `created_at` | timestamptz | |

### `schedule`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `parent_id` | uuid FK → parent.id | |
| `drug_name` | text | Free-text in Phase A; validated against drug DB in Phase C |
| `dosage` | text | e.g., "1 tablet" or "500mg" |
| `meal_relation` | enum('before_meal','after_meal','with_meal','no_relation') | |
| `scheduled_time_ist` | time | HH:MM in IST |
| `days_of_week` | int[] | 0=Sun, 6=Sat; e.g. `{1,2,3,4,5}` for weekdays |
| `start_date` | date | |
| `end_date` | date (nullable) | NULL = open-ended |
| `qstash_schedule_id` | text | Reference to QStash recurring job |
| `active` | boolean | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `call_log`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `schedule_id` | uuid FK → schedule.id | |
| `parent_id` | uuid FK → parent.id | Denormalized for RLS |
| `vapi_call_id` | text | Unique; idempotency key |
| `attempt_number` | int | 1, 2, or 3 |
| `initiated_at` | timestamptz | |
| `answered_at` | timestamptz (nullable) | NULL if no answer |
| `ended_at` | timestamptz | |
| `duration_seconds` | numeric | |
| `outcome` | enum('confirmed','denied','no_answer','deferred','escalated_side_effect','escalated_no_answer') | |
| `transcript` | text | Auto-purged after 30 days (DPDP) |
| `transcript_excerpt` | text | First 500 chars; retained 365 days |
| `audio_recording_url` | text (nullable) | Supabase Storage; auto-purged 30 days |
| `latency_p95_ms` | int | Per-call P95 turn latency from Vapi analytics |
| `cost_usd` | numeric | Vapi + Sarvam + Exotel per call |
| `guardrail_violations` | text[] | Empty in healthy case; non-empty = P0 |
| `created_at` | timestamptz | |

**Row Level Security:** every table has `caregiver_id` resolution path; all SELECTs/UPDATEs scoped by `caregiver_id = auth.uid()`. Tested per master plan §2.5.

---

## 5. Security Model

### 5.1 DPDP Compliance (Phase-Gated)

| Requirement | Pilot | Phase A | Phase B | Phase C |
|---|---|---|---|---|
| Caregiver consent | Verbal (Shubh logs) | Verbal + Supabase audit row | Verbal + audit row | **OTP digital proxy consent** |
| Parent consent | Verbal via caregiver | Verbal via caregiver | Verbal via caregiver | **OTP SMS to parent's phone, parent shares with caregiver, caregiver enters → cryptographic bind** |
| Data minimization | Manual delete post-pilot | Auto-purge audio @ 30d, transcript-full @ 30d, excerpt retained 365d | Same as A | Same + automated right-to-erasure cascade |
| RLS | N/A | Yes, tested | Yes | Yes |
| Encryption at rest | N/A | Supabase Pro AES-256 default | Same | Same |
| TLS in transit | Default | TLS 1.3 enforced | Same | Same |
| Privacy Policy | N/A | Plain Hindi + English | Add Odia, Bengali, Tamil, Telugu, Malayalam | All 6 + audit by privacy counsel |
| DPAs with vendors | N/A | Vapi, Sarvam, Exotel | Add WhatsApp vendor | Add Veryfi |
| Right-to-erasure UI | Manual | Manual + email Shubh | Manual + email Shubh | **UI button → cascading delete** |
| Breach notification | N/A | Internal log only | Internal log | 72h window to Data Protection Board |

### 5.2 Caregiver Consent Flow

- **Pilot:** Shubh calls each of 5 caregivers, gets verbal yes, writes timestamp into a notebook. Caregiver tells parent in advance.
- **Phase A:** Caregiver signs up via Supabase Auth → on creating first parent profile, accepts a Hindi+English Terms checkbox attesting they have verbal consent from parent. Row inserted into `consent_audit` table.
- **Phase B:** Same as Phase A, but Terms available in 6 languages; caregiver picks language at acceptance.
- **Phase C:** **OTP proxy consent flow.** On parent profile create, system sends OTP SMS via Exotel to `phone_e164`. Caregiver enters OTP in dashboard. Server hashes the OTP, stores in `parent.consent_otp_hash`, sets `consent_method='otp'` and `consent_verified_at`. Without this, no call can be scheduled.

### 5.3 Data Minimization

- **Audio recordings:** Auto-purged from Supabase Storage at 30 days via Supabase scheduled function. Mandatory per master plan §2.5.
- **Full transcripts:** Auto-purged from `call_log.transcript` at 30 days (column nulled out, row retained for analytics).
- **Transcript excerpts (first 500 chars):** Retained 365 days for adherence-streak analytics.
- **Prescription images (Phase C):** Auto-purged at 30 days after caregiver approval.
- **Patient phone number:** Retained for the life of the active parent profile; hard-deleted on caregiver right-to-erasure.

### 5.4 Auth Token Rotation Policy

- **Supabase Auth JWT:** Default 1-hour access token, 30-day refresh token. Rotate refresh on use.
- **Vapi API key:** Stored in Render env vars. Rotate every 90 days; immediate rotation on suspected compromise.
- **Sarvam API key:** Same policy as Vapi.
- **Exotel API key:** Same; additionally rotate immediately if any DLT template changes.
- **QStash signing key:** Rotate every 90 days; webhook verification mandatory.
- **WhatsApp Business token (Phase C):** Rotate per WhatsApp's policy (currently 60-day rolling).
- **Razorpay keys (Phase C):** Separate test and live keys; rotate live keys every 90 days.

### 5.5 Transcript Retention

| Asset | Retention | Reason |
|---|---|---|
| Audio recording | 30 days | DPDP data minimization |
| Full transcript text | 30 days | DPDP data minimization |
| Transcript excerpt (500 chars) | 365 days | Adherence analytics, streak calendar |
| Vapi `call_id` + outcome + timestamps | Indefinite (until right-to-erasure) | Adherence rate computation |
| Guardrail violation transcripts | 365 days (anonymized) | Compliance audit + model improvement |

---

## 6. Cost Model

### 6.1 Pilot Cost Breakdown (per call)

| Component | Unit cost | Per call (avg 30s) | Notes |
|---|---|---|---|
| Vapi orchestration | $0.05/min | $0.025 | 30s call |
| Sarvam Saaras STT | ₹30/hr ≈ $0.36/hr | ~$0.003 | 30s |
| Sarvam Bulbul v3 TTS | ₹30/10K chars ≈ $0.36/10K | ~$0.005 | ~1.5K chars typical |
| Sarvam-105B LLM | Free | $0.00 | (Or GPT-4o-mini fallback: ~$0.001) |
| Twilio +91 outbound | $0.0496/min | $0.025 | 30s |
| Google Sheet + Apps Script | Free | $0.00 | |
| **Total per call** | | **~$0.058** | **Target met: ~$0.05/call** |

**Pilot total: 25 calls × $0.058 ≈ $1.45**. Covered by Twilio trial credit ($15.50) + Sarvam signup credit (₹1,000).

### 6.2 Phase A Cost Breakdown (per call, at 50-parent scale)

Assumptions: 50 parents × 3 meds/day × 1.15 retry factor = 172 calls/day, avg call ~1.5 min (longer than pilot due to retry/side-effect paths handled in dialogue).

| Component | Unit cost | Per call (avg 1.5 min) | Notes |
|---|---|---|---|
| Vapi orchestration | $0.05/min | $0.075 | |
| Sarvam Saaras STT | ₹30/hr ≈ $0.36/hr | ~$0.009 | 1.5 min |
| Sarvam Bulbul v3 TTS | ₹30/10K chars | ~$0.015 | ~4K chars |
| Sarvam-105B LLM | Free | $0.00 | (Or fallback ~$0.005) |
| Exotel outbound | ₹0.90/min ≈ $0.011/min | $0.017 | 1.5 min |
| Supabase storage + DB amortized | $25/mo ÷ 172 × 30 = ~$0.005 | $0.005 | |
| Render API amortized | $7/mo ÷ 172 × 30 = ~$0.0014 | $0.0014 | |
| QStash amortized | $10/mo ÷ 172 × 30 = ~$0.002 | $0.002 | |
| **Total per call** | | **~$0.124** | |
| **+ WhatsApp escalation (5% of calls)** | $0.015/msg | $0.00075 amortized | |
| **+ Vercel + monitoring amortized** | ~free | $0.001 | |
| **All-in per call** | | **~$0.13** | |

**Phase A monthly cost at 50 parents:** ~172 calls/day × 30 days × $0.13 ≈ **$670/month** all-in. Master plan §3.2 estimates ₹88,920 (~$1,062), and my number is lower because I assumed shorter average call time (1.5min vs 2.5min) and used Sarvam free LLM. Realistic target: **$0.30/call worst-case** including occasional GPT-4o-mini fallback and longer call durations — well inside master plan's projected $1,062/month for 50 parents.

### 6.3 Cost-Reduction Levers (Phase A → Phase C)

- Apply for **Sarvam startup credits** (master plan §3.5).
- Apply for **Vapi startup programme** — free credits for early-stage healthtech.
- Cut average call duration by tightening TTS pacing and shorter scripts — saves ~40% on Vapi + Exotel.
- Time-band calls 7-9 AM and 7-9 PM — higher pickup rates, fewer retries.
- Negotiate Exotel custom rate at 50+ parents — they will move on rate per master plan §3.5.

---

## 7. Fallback Paths

| Primary | Failure mode | Fallback | Switching mechanism |
|---|---|---|---|
| **Sarvam-105B LLM** | Rate limit / latency spike / API down | **GPT-4o-mini** (OpenAI) | Vapi assistant config has both as listed providers; flip the active LLM in Vapi dashboard in <2 min. For automated failover, use Vapi's built-in provider routing once it supports it (currently manual). |
| **Twilio +91 outbound** (pilot) | Trial blocked / KYC rejected | **Plivo $10 trial credit** | Day 0 contingency. Same Vapi assistant; swap the telephony provider in Vapi config. Both Twilio and Plivo support E.164 +91 outbound. |
| **Exotel +91 outbound** (Phase A) | Outage / DLT template suspended | **Plivo +91 paid** as warm standby | Render env var `TELEPHONY_PROVIDER=exotel|plivo`; Render code calls the active provider via Vapi's provider routing. Switch is a single Render env update + redeploy (<5 min). |
| **Vapi orchestration** | Vapi platform outage | **LiveKit Agents** (self-hosted on Render or Fly.io) | Architectural fallback — not a runtime failover. Vapi outage exceeding SLA triggers a migration plan, not an instant flip. Phase A risk; Phase C should evaluate dual-stack to LiveKit for true HA. |
| **Sarvam Saaras STT** | Sarvam API down or WER spike | **Deepgram Nova-3** or **AssemblyAI** in Hindi | Vapi custom-provider config swap; quality penalty acceptable for short outages. |
| **Sarvam Bulbul v3 TTS** | Sarvam API down | **ElevenLabs Hindi** or **Azure Speech Hindi** | Vapi custom-provider config swap. Voice character changes — caregiver-facing notification advisable if outage > 1 hour. |
| **Supabase Pro** | Outage > Supabase SLA | **Read-only replica via PgBouncer to a Neon Postgres warm standby** | Phase C migration plan. Daily logical backups already; Phase B adds streaming replication setup. |
| **Render Starter** | Outage / cold start despite always-on | **Healthchecks.io pings every 5 min**; Vapi webhook retries up to 3x with exponential backoff | If Render down > 5 min, escalate to Shubh via PagerDuty / phone. |
| **QStash** | Outage | **Inngest** as warm standby for durable cron | Phase B migration plan if QStash reliability becomes an issue. |
| **WhatsApp Business API (Phase C)** | Account suspension / Facebook verification stuck | **Plivo SMS** for escalation | Caregiver notification preference defaults to "both"; SMS fires unconditionally on escalation regardless of WA status. |
| **Veryfi OCR (Phase C)** | Accuracy drops below threshold | **Koncile** OCR as warm alternative | Per master plan §5.1. Validation spike before signing primary contract. |

---

## Open Decisions Deferred Past This Document

1. **Post-pilot demand test:** if pilot is PASS, do we do the landing page + paid pre-order smoke test before Phase A, or jump straight to Phase A on warm contacts? Decision deferred to post-pilot synthesis writeup (Day 10).
2. **DPDP OTP proxy-consent UX:** mandatory validation spike with 10 real dyads in Wizard-of-Oz before Phase C build. Per validation doc §"Validating the Digital Proxy Consent Protocol" — this is the riskiest non-engineering gate.
3. **WhatsApp Business vendor choice:** Twixor vs Plivo vs Gupshup vs WATI. Defer to Phase C scoping. Plivo is the early lead because we may already be using them for SMS by then.
4. ~~**Vapi vs LiveKit decision:**~~ **CLOSED 2026-06-15 PM** → LiveKit primary, Vapi A/B baseline.
4a. ~~**LiveKit Cloud vs self-host:**~~ **LOCKED 2026-06-15 PM** → Cloud for migration; self-host at Phase A DPDP trigger.
4b. ~~**Cutover vs A/B for pilot:**~~ **LOCKED 2026-06-15 PM** → A/B Days 5-9 (P1-3 Vapi, P4-5 LiveKit). Cutover criteria evaluated Day 10.
4c. ~~**Prompt storage:**~~ **LOCKED 2026-06-15 PM** → YAML file (`admin-panel/prompts.yaml`) for pilot; Supabase row at Phase A.
4d. ~~**Admin-UI framework:**~~ **LOCKED 2026-06-15 PM** → Streamlit + YAML for pilot; Next.js + Supabase at Phase A.
5. **Exotel onboarding timeline:** start outreach to hello@exotel.com on Day 1 of pilot so KYC + DLT + Exophone provisioning is done in time for Phase A kickoff.
6. **Pricing tier for Phase C:** ₹1,500/dyad/month is the working assumption. Validate via smoke test (landing page with pricing) before Phase C build commits.

---

*End of PRD + TRD v1. Next step: review with self (and optionally `/codex consult` for a second pair of eyes), then begin Day 0 of pilot per the day-by-day plan in `2026-06-15-medicall-pilot-mvp-design.md` §"What the /plan step will produce next."*
