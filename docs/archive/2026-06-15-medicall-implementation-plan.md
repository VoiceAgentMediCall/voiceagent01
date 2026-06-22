# MediCall AI Pilot — Day 0 to Day 10 Implementation Plan

**Date:** 2026-06-15
**Spec:** `voiceagent/docs/2026-06-15-medicall-pilot-mvp-design.md`
**Operator:** Shubh (solo)
**Window:** Day 0 (2026-06-15) → Day 10 (2026-06-25)
**Out-of-pocket budget cap:** ₹500 (expected spend ~₹100)

---

## Legend

- **Owner: Shubh-only** — physical, account-bound, or human-judgement work. Assistant cannot do this.
- **Owner: Assistant-only** — config drafting, code/script generation, prompt iteration, transcript analysis. No account access.
- **Owner: Joint** — Assistant produces the artifact; Shubh pastes/clicks/verifies in his own dashboard.

## Already-done (Day 0 partial)

- Twilio account live; +1 814 524 3223 purchased
- Twilio Account SID + Auth Token captured
- Shubh's own +91 8104 348 262 verified as Twilio Caller ID
- Vapi account exists; private/server API key captured
- Sarvam account exists; API key captured
- Pilot spec locked at `voiceagent/docs/2026-06-15-medicall-pilot-mvp-design.md`

Remaining Day 0 work below picks up from this state.

---

## Day 0 — Today (2026-06-15): Scaffold + first dial tone

**Deliverable at EOD:** A Vapi assistant exists in the Vapi dashboard, wired to the Twilio +1 814 524 3223 number, using whatever default STT/TTS/LLM Vapi ships with (Deepgram / Azure / GPT-4o-mini). A Google Sheet with `schedule` + `call_logs` tabs exists. An Apps Script Web App is deployed (even if not yet wired to Vapi). A test call from the Vapi dashboard to Shubh's own +91 number completes end-to-end and Shubh hears something speak Hindi-ish back at him.

**Why fallbacks today:** Sarvam custom-provider wiring is Day 1 work. Don't block first dial tone on it.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 0.1 | Joint | Assistant drafts the Vapi assistant config JSON (system prompt = Hindi dialogue from spec §Dialogue, model = `gpt-4o-mini` as Day-0 placeholder, voice = Azure `hi-IN-SwaraNeural` or Deepgram default Hindi, transcriber = Deepgram `nova-2` with `language: hi`). Shubh pastes into Vapi dashboard → Create Assistant. |
| 0.2 | Shubh-only | In Vapi dashboard → Phone Numbers → Import from Twilio. Paste Twilio Account SID + Auth Token + +1 814 524 3223. Attach the imported number to the new assistant. |
| 0.3 | Shubh-only | Create Google Sheet `MediCall Pilot Log`. Tab 1 `schedule` columns: `parent_name`, `phone_e164`, `drug_name`, `dose_time`, `language`. Tab 2 `call_logs` columns: `timestamp`, `parent_name`, `outcome`, `transcript_excerpt`, `duration_sec`, `vapi_call_id`. Row 1 of schedule = Shubh's own number, drug = "Crocin", dose_time = "10:00 AM IST" (for today's dial test). |
| 0.4 | Joint | Assistant drafts Apps Script `doPost(e)` handler: parses Vapi end-of-call JSON, maps `endedReason` + extracted dialogue intent to one of `CONFIRMED` / `DENIED` / `NO_ANSWER`, appends row to `call_logs`. Shubh opens Sheet → Extensions → Apps Script, pastes code, Deploy → Web App → Execute as Me + Anyone. Copies the resulting `/exec` URL. |
| 0.5 | Shubh-only | In Vapi assistant → Server URL field, paste the Apps Script `/exec` URL. (Vapi will POST end-of-call events here. Day-3 verifies it actually fires.) |
| 0.6 | Shubh-only | From Vapi dashboard → Test Call → dial +91 8104 348 262 (his own verified number). Pick up. Listen. Hang up. |
| 0.7 | Joint | Shubh shares the Vapi call recording link + Apps Script row (if any). Assistant flags whether voice was intelligible Hindi, latency felt OK, and whether the call_logs row appeared. |

### Verification

- Shubh's phone rings from +1 814 524 3223.
- Some voice speaks the greeting (quality TBD — fix tomorrow).
- Vapi dashboard shows the call entry with duration > 0s and a transcript.
- Bonus if call_logs row already appended; if not, that's Day 3's job.

### Failure modes + fallback

| If… | Then… |
|---|---|
| Twilio outbound to +91 blocked (carrier filtering, trial-restriction) | Verify Shubh's number is on the Twilio "Verified Caller IDs" list (already done per pre-state). If still blocked, switch Twilio account from Trial → upgrade with $20 top-up; trial-mode outbound to India sometimes silently fails even when source CID is verified. |
| Vapi can't import Twilio credentials | Re-check Account SID format (`AC…`) and confirm the +1 number is provisioned (not just reserved) in Twilio console. |
| Apps Script `/exec` URL returns Authorization Required | Redeploy with "Who has access: Anyone" — Vapi can't OAuth into a `Anyone with Google account` endpoint. |
| Test call connects but no audio | Day 0 placeholder voice provider may not have Hindi loaded. Switch to `gpt-4o-mini` + ElevenLabs default voice as a pure English smoke test — confirm telephony+orchestration works first, then fix Hindi tomorrow. |

---

## Day 1 (2026-06-16): Plug in Sarvam (STT + TTS + LLM)

**Deliverable at EOD:** The Day-0 placeholder providers (Deepgram STT, Azure TTS, GPT-4o-mini LLM) are replaced inside the same Vapi assistant by Sarvam Saaras (STT), Sarvam Bulbul v3 (TTS), and Sarvam-105B (LLM via Vapi's `custom-llm` config). A second test call to Shubh's own number completes end-to-end on the Sarvam stack and the voice sounds noticeably more like a natural Hindi speaker.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 1.1 | Assistant-only | Pull Vapi's "custom provider" docs (Context7 or Vapi docs) for: (a) custom transcriber endpoint, (b) custom voice endpoint, (c) custom LLM endpoint. Confirm the JSON shape each expects and the Sarvam endpoint URLs (`/speech-to-text-translate`, `/text-to-speech`, `/chat/completions`). |
| 1.2 | Joint | Assistant drafts the Vapi assistant JSON patch swapping in: `transcriber = { provider: "custom-transcriber", url: "<Sarvam Saaras endpoint>", headers: { "api-subscription-key": "<key>" } }`. Shubh pastes into Vapi dashboard. |
| 1.3 | Joint | Assistant drafts the voice block: `voice = { provider: "custom-voice", url: "<Sarvam Bulbul v3 endpoint>", model: "bulbul:v3", speaker: "anushka" or similar Hindi voice, headers }`. Shubh pastes. |
| 1.4 | Joint | Assistant drafts `model = { provider: "custom-llm", url: "https://api.sarvam.ai/v1/chat/completions", model: "sarvam-m", headers }`. Shubh pastes. |
| 1.5 | Shubh-only | Vapi dashboard → Test Call → +91 8104 348 262. Listen end-to-end. Note: voice naturalness, STT accuracy of his replies, end-to-end turn latency. |
| 1.6 | Joint | Shubh shares the recording + transcript. Assistant compares against Day-0 baseline and flags whether each Sarvam swap improved or regressed quality. |

### Verification

- Call completes with all three Sarvam components in path (verify via Vapi call log → provider breakdown).
- Voice on the call is recognizably Sarvam Bulbul (not Azure). Shubh judges by ear.
- Sarvam STT transcript appears in Vapi log and roughly matches what Shubh said.

### Failure modes + fallback

| If… | Then… |
|---|---|
| Vapi custom-transcriber JSON shape doesn't match Sarvam's response format | Spec gives explicit fallback: keep Deepgram for STT, swap only TTS + LLM. Log this as a tech debt and revisit. |
| Sarvam-105B LLM rate-limits or 5xx's mid-call | Fall back `model.provider` to `openai`, `model = gpt-4o-mini`, system prompt unchanged. Sarvam STT/TTS stay in path. |
| Sarvam TTS endpoint refuses Vapi's request shape (streaming vs chunked) | Fall back to Vapi's built-in `azure` voice `hi-IN-SwaraNeural`. Flag in pilot writeup that TTS is not Sarvam — this affects naturalness conclusion. |
| Latency on Sarvam round-trip blows past 1.5s P95 | Note in pilot writeup; this is *evidence*, not failure. Keep going. |

---

## Day 2 (2026-06-17): Prompt iteration + 3 test calls

**Deliverable at EOD:** The Vapi system prompt has been revised from the spec's v1 dialogue based on Day-1 transcript observations. 3 additional test calls placed to Shubh's own number, with prompt tweaked between each call. At least one of the three calls cleanly reaches `CONFIRMED` and at least one cleanly reaches `DENIED` — both verifiable from Vapi dashboard.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 2.1 | Assistant-only | Read Day-1 transcript. Flag: did the assistant talk over Shubh? Did it follow the script? Did "haan" / "le liya" register as confirmation? Did Sarvam mis-transcribe any confirmation word? Did call exceed 90s? |
| 2.2 | Joint | Assistant proposes prompt revision v2 (e.g. add explicit "wait for user to finish before responding", tighten end-call triggers, add more `endCallPhrases`). Shubh pastes into Vapi. |
| 2.3 | Shubh-only | Test call 1 to own number. Answer with "Haan le liya". Expect → CONFIRMED + hang up. |
| 2.4 | Joint | Review transcript. Iterate prompt → v3. Shubh pastes. |
| 2.5 | Shubh-only | Test call 2. Answer with "Nahi abhi nahi". Expect → DENIED + hang up. |
| 2.6 | Joint | Review. Iterate → v4. |
| 2.7 | Shubh-only | Test call 3. Answer with deliberate ambiguity ("hmm dekhte hain"). Expect → assistant clarifies once, then either CONFIRMED or DENIED, but NEVER loops > 90s. |
| 2.8 | Assistant-only | Save the final v4 system prompt into `voiceagent/docs/prompts/medicall-system-prompt-v4.md` for version control. |

### Verification

- All 3 calls completed in < 90s each.
- Final v4 prompt is committed to docs.
- No guardrail violation in any transcript (no medical advice, no drug-name change).

### Failure modes + fallback

| If… | Then… |
|---|---|
| Assistant interrupts Shubh / talks over him | Add `silenceTimeoutSeconds` and `responseDelaySeconds` to Vapi config. Re-test. |
| Sarvam STT mis-hears "Haan" as "Naah" repeatedly | Add example phrases to system prompt: "User confirming may say: haan, ji haan, le liya, ho gaya, kha liya". Re-test. |
| Call hits 90s without terminating | Add `maxDurationSeconds: 90` hard cap at Vapi config level. Mark these as `DENIED (timeout)` in outcome mapping. |
| Sarvam-105B drops sessions mid-call | Switch to GPT-4o-mini for the rest of Day 2. Don't burn the iteration window debugging Sarvam-105B if it's flaky. |

---

## Day 3 (2026-06-18): Webhook end-to-end

**Deliverable at EOD:** A single test call produces a single row in `call_logs` with all fields correctly populated, for each of the three outcomes (CONFIRMED, DENIED, NO_ANSWER — for NO_ANSWER, simulate by not picking up). The Apps Script handler is bulletproof against Vapi payload shape changes and logs errors visibly.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 3.1 | Assistant-only | Re-read the Apps Script `doPost` from Day 0.4. Refactor to: (a) parse Vapi `end-of-call-report` event specifically (not all events), (b) extract `outcome` by scanning the transcript for keyword markers from the prompt (look for the assistant's final sentence pattern — "Bahut achha" → CONFIRMED, "Kripya jaldi le lijiye" → DENIED, `endedReason: "silence-timeout" or "customer-did-not-answer"` → NO_ANSWER), (c) log errors to a 3rd sheet tab `error_log`. |
| 3.2 | Joint | Assistant provides full Apps Script source. Shubh pastes, re-deploys (new version), copies new `/exec` URL (or keeps same if "deploy" reused), confirms Vapi assistant Server URL still points to it. |
| 3.3 | Shubh-only | Test call A: answer with "Haan le liya". Verify call_logs row appears with `outcome=CONFIRMED`, `transcript_excerpt` contains the exchange, `duration_sec` > 0, `vapi_call_id` populated. |
| 3.4 | Shubh-only | Test call B: answer with "Nahi". Verify row with `outcome=DENIED`. |
| 3.5 | Shubh-only | Test call C: do NOT answer (let it ring out, or pick up then immediately hang up). Verify row with `outcome=NO_ANSWER`. |
| 3.6 | Assistant-only | If any row is malformed, debug the Apps Script `error_log` tab. Re-iterate. |

### Verification

- 3 rows in `call_logs`, one per outcome, each with all 6 columns populated.
- `error_log` tab is empty (or contains only expected/handled errors).

### Failure modes + fallback

| If… | Then… |
|---|---|
| Vapi `end-of-call-report` payload shape doesn't match our parser | Log the raw payload to `error_log` in pretty-printed JSON. Update parser. Vapi's webhook payload is documented but evolves. |
| Apps Script `/exec` returns 200 but no row appears | Likely a permissions issue — re-deploy with execute-as = Me, access = Anyone, even if it warns. |
| Vapi retries the webhook (idempotency) and we get duplicate rows | Add a check: before appending, query existing rows for the same `vapi_call_id`. If found, skip. |
| Outcome keyword extraction is brittle (assistant deviates from prompt) | Fallback to mapping purely on `endedReason` + `endedAt - startedAt` duration heuristic. Log uncertainty to a new column `outcome_confidence`. |

---

## Day 4 (2026-06-19): Caregiver pre-briefs + parent number verification

**Deliverable at EOD:** All 5 parent phone numbers are verified as Twilio Caller IDs. All 5 caregivers have been WhatsApped a briefing message + acknowledged. Pilot is one click away from going live. The `schedule` tab has 5 real rows with real parent details.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 4.1 | Shubh-only | Identify the 5 caregiver+parent pairs. WhatsApp each caregiver: "Pilot starts kal subah 9-11 baje. Aap please apne mummy/papa ko bata dena ki kal MediCall ka phone aayega — AI hai, mera prototype hai, ek minute ka call hai, please jawab dijiye." Wait for ACK from all 5. |
| 4.2 | Shubh-only | For each of the 5 parent numbers: Twilio console → Phone Numbers → Verified Caller IDs → Add. Twilio calls the number with a 6-digit code. Caregiver picks up at parent's end + reads code back to Shubh on WhatsApp. Shubh enters in Twilio console. Repeat ×5. |
| 4.3 | Shubh-only | Populate `schedule` tab with 5 real rows. Phone numbers in `+91XXXXXXXXXX` E.164 format. `drug_name` is whatever real medication the parent actually takes (from caregiver). `dose_time` set to 9:30 AM IST for all 5 (staggered 9:30, 9:35, 9:40, 9:45, 9:50 so Shubh can dial sequentially). |
| 4.4 | Assistant-only | Pre-draft the WhatsApp recap template Shubh will send each caregiver each evening: "Aaj ki call: [Outcome]. Transcript: [excerpt]. Kal phir try karenge." Save to `voiceagent/docs/templates/whatsapp-recap-template.md`. |
| 4.5 | Joint | Dry run: Assistant builds a Day-5 checklist Shubh can print/screenshot for tomorrow morning — 5 parent rows, their dial-time, and a 1-line prompt-version reminder. |

### Verification

- Twilio console shows 5 new entries under Verified Caller IDs (plus Shubh's own = 6 total).
- WhatsApp ACKs from all 5 caregivers.
- `schedule` tab has 5 populated rows.

### Failure modes + fallback

| If… | Then… |
|---|---|
| A caregiver doesn't ACK by EOD | Shubh calls them directly. If unreachable, drop that pair from the pilot — proceed with 4 parents. The spec's "≥ 3 of 5 answer" threshold accommodates this. |
| OTP verification fails on a parent's number (no answer / wrong code) | Reschedule OTP attempt for next morning before pilot starts. Worst case: that parent is dropped from pilot. |
| A parent refuses outright once caregiver explains | Drop and replace if possible; otherwise pilot runs with N=4. |
| Twilio Verified Caller ID limit hits trial cap | Upgrade Twilio account ($20 top-up). Trial allows ~10 verified CIDs, should be fine for 6, but check before getting stuck. |

---

## Day 5 (2026-06-20): Pilot Day 1 — first real calls

**Deliverable at EOD:** 5 calls placed to 5 real parents between 9:30 AM and 9:50 AM IST. Each call's outcome logged to `call_logs`. Evening transcript review done. Prompt v5 staged for tomorrow.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 5.1 | Shubh-only | 9:25 AM: open Vapi dashboard + Google Sheet `schedule` + WhatsApp side-by-side. |
| 5.2 | Shubh-only | 9:30 AM: dial Parent 1 from Vapi dashboard. Listen live (Vapi supports live monitor). Do NOT intervene unless guardrail violation. Hang up only via the assistant's flow. |
| 5.3 | Shubh-only | Repeat at 9:35 / 9:40 / 9:45 / 9:50 for Parents 2-5. |
| 5.4 | Shubh-only | After each call: verify a row appeared in `call_logs`. If not, note the `vapi_call_id` for Day-5-evening debugging. |
| 5.5 | Shubh-only | By 10:30 AM: WhatsApp each caregiver the recap (from Day 4.4 template), filled in. |
| 5.6 | Joint | Evening (~8 PM IST): Assistant reads all 5 transcripts (Shubh pastes them in). Flags: pickup rate, STT errors, guardrail near-misses, latency feel, surprising parent reactions. Proposes prompt v5 if warranted. |
| 5.7 | Shubh-only | Paste prompt v5 into Vapi assistant for tomorrow's run. |

### Verification

- 5 rows in `call_logs` for today's date.
- 5 WhatsApp recaps sent.
- Evening review notes saved to `voiceagent/docs/pilot-notes/day-5.md`.

### Failure modes + fallback

| If… | Then… |
|---|---|
| All 5 parents reject the call (hang up < 10s) | Stop dialing. Evening review: was it the +1 814 524 3223 caller ID? Is the voice too robotic? Caregiver didn't actually pre-brief? Decide Day-6 strategy: re-brief, switch caller ID display name (Twilio CNAM), or pause pilot. |
| Guardrail violation (assistant gives medical advice) | STOP entire pilot. Fix prompt. Do not resume until violation is reproducibly impossible in test calls. |
| Webhook fails on all 5 — no rows in call_logs | Pilot is not blocked, but data is. Manually transcribe from Vapi dashboard for today. Fix webhook before Day 6. |
| Sarvam goes down | Switch assistant to fallback stack (GPT-4o-mini + Azure Hindi voice) before Day 6 dial window. Note in pilot writeup that Days N-onwards used fallback. |

---

## Day 6 (2026-06-21): Pilot Day 2 — iterate

**Deliverable at EOD:** Same as Day 5 with prompt v5. By end of day there are 10 total rows in `call_logs`.

### Subtasks

Same flow as Day 5, with prompt v5 from last night.

| # | Owner | Task |
|---|---|---|
| 6.1 | Shubh-only | 9:30-9:50 AM: 5 calls, same parent order. |
| 6.2 | Shubh-only | Post-call: log + WhatsApp recap. |
| 6.3 | Joint | Evening review. Compare Day-6 outcomes vs Day-5. Are pickup rates trending up (parents getting habituated to the caller ID) or down (annoyance)? Iterate to v6. |

### Verification

- 5 more rows in `call_logs`.
- Day-6 notes saved.

### Failure modes + fallback

Same playbook as Day 5. Additionally: if a parent has now hung up on both Day 5 + Day 6, consider that parent a confirmed "no" and stop dialing them — don't burn goodwill.

---

## Day 7 (2026-06-22): Pilot Day 3 — mid-pilot checkpoint

**Deliverable at EOD:** 15 total rows. Mid-pilot decision: do we have enough signal to call it early (PASS so clear we don't need 2 more days)? Do we need to extend (INCONCLUSIVE)?

### Subtasks

| # | Owner | Task |
|---|---|---|
| 7.1 | Shubh-only | Same morning flow. |
| 7.2 | Joint | Mid-pilot tally: across 15 calls so far, what's the answer rate, the clean-terminal-state rate, the guardrail-violation count? Compute vs spec's success criteria. |
| 7.3 | Joint | Decision: continue 2 more days (default), stop early (if PASS is obvious), or extend (if INCONCLUSIVE). |

### Verification

- 15 total rows.
- Mid-pilot tally written to `voiceagent/docs/pilot-notes/mid-pilot-tally.md`.

### Failure modes + fallback

If everything is going so well that we hit PASS thresholds by Day 7: stop dialing, save the goodwill, jump to Day 10 synthesis. Spec doesn't reward extending past evidence sufficiency.

---

## Day 8 (2026-06-23): Pilot Day 4

**Deliverable at EOD:** 20 total rows (if continuing).

Same flow as Days 5-6. Prompt should be largely stable by now; iterations are minor.

### Verification

- 20 rows. Day-8 notes saved.

### Failure modes + fallback

Same. By now you should have evidence on whether parents are *more* or *less* willing to answer on day 4 — that itself is the engagement signal.

---

## Day 9 (2026-06-24): Pilot Day 5 — final call day

**Deliverable at EOD:** 25 total rows. All pilot data captured. No more dialing.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 9.1 | Shubh-only | Final morning round, 5 calls. |
| 9.2 | Shubh-only | Final WhatsApp recap to each caregiver including thank-you + "pilot khatam, kal ya parso main aapko poora summary bhejunga". |
| 9.3 | Joint | Evening: full data freeze. Export `call_logs` as CSV and save to `voiceagent/docs/pilot-data/day-5-to-day-9-call-logs.csv`. |

### Verification

- 25 rows total in `call_logs`.
- CSV export saved.
- All 5 caregivers thanked.

### Failure modes + fallback

If a caregiver asks to extend ("can you call my mom one more time?"), politely decline — the pilot window is closed. Note their request in the synthesis as a positive demand signal.

---

## Day 10 (2026-06-25): Synthesis + decision

**Deliverable at EOD:** A written synthesis document at `voiceagent/docs/2026-06-25-medicall-pilot-synthesis.md` that delivers a PASS / FAIL / INCONCLUSIVE verdict against each of the spec's 5 success criteria, with evidence cited from `call_logs` and transcripts. Decides the next sprint.

### Subtasks

| # | Owner | Task |
|---|---|---|
| 10.1 | Assistant-only | From the CSV + transcripts, compute: pickup rate, clean-terminal-state rate, average duration, P95 turn latency from Vapi analytics, count of guardrail violations, count of NO_ANSWER, distribution of CONFIRMED vs DENIED. |
| 10.2 | Joint | Score each spec success criterion: (a) ≥ 3 of 5 answer at least once, (b) Sarvam Saaras WER on confirmation phrases < 10%, (c) no parent hangs up immediately on hearing the voice, (d) ≥ 70% of answered calls reach clean terminal state, (e) P95 turn latency < 1.2s. |
| 10.3 | Joint | Compute PASS/FAIL/INCONCLUSIVE per spec rules (all 3 of: ≥ 3 of 5 answer, ≥ 60% clean terminal on answered, zero guardrail violations). |
| 10.4 | Assistant-only | Write the synthesis doc. Sections: TL;DR verdict, evidence table, per-criterion analysis, what surprised us, what to do next (per the spec's "If PASS / If FAIL" decision tree). |
| 10.5 | Shubh-only | Read synthesis. Approve or push back. If approved, the next sprint is either landing page demand test (if PASS) or dialogue iteration round 2 (if FAIL) — that's the input to the post-pilot `/prd` work. |

### Verification

- Synthesis doc exists at the specified path.
- Verdict is one of {PASS, FAIL, INCONCLUSIVE}.
- Next-sprint scope is named.

### Failure modes + fallback

| If… | Then… |
|---|---|
| Verdict is INCONCLUSIVE because N=5 is too small | Synthesis explicitly recommends a Round 2 with N=10-15 before the demand-test sprint. Don't fake a verdict. |
| Verdict is FAIL but Twilio transoceanic latency was clearly the cause | Synthesis flags this and recommends Exotel onboarding (parked in spec) as a P0 *before* concluding the engagement hypothesis itself failed. |
| Verdict is PASS but only because of generous interpretation | Be honest. Mark as PASS-with-caveats and downgrade confidence on the engagement signal. The whole point of the pilot is honest evidence, not vanity. |

---

## Cross-cutting risks to watch all 10 days

- **Cost creep:** Total expected pilot airtime ~25 min × ~$0.10/min ≈ $2.50, comfortably inside Twilio trial credit + Sarvam credit. Watch the Twilio balance daily; any spike means something is retrying in a loop.
- **Goodwill burn:** 5 caregivers are warm contacts. Every call we place is a small social withdrawal from them. If we sense annoyance, stop early.
- **Guardrail violation:** Single biggest reputational risk. If the assistant ever gives medical advice in any test call, halt and fix before resuming. Non-negotiable.
- **Prompt drift:** Keep every prompt version under `voiceagent/docs/prompts/` so Day 10 synthesis can attribute outcome changes to specific prompt changes.

---

## Single-page summary

| Day | Date | Output | Owner mix |
|---|---|---|---|
| 0 | 2026-06-15 | First dial tone (fallback stack), Sheet + Apps Script live, test call to self | Joint |
| 1 | 2026-06-16 | Sarvam STT+TTS+LLM swapped in, second self-test | Joint |
| 2 | 2026-06-17 | Prompt iterated to v4, 3 self-tests covering all 3 outcomes | Joint |
| 3 | 2026-06-18 | Webhook bulletproof, 3 outcomes verified in call_logs | Joint |
| 4 | 2026-06-19 | 5 parent CIDs verified, 5 caregivers briefed, schedule populated | Shubh-only |
| 5 | 2026-06-20 | Pilot Day 1: 5 real calls, evening iteration | Shubh + Joint review |
| 6 | 2026-06-21 | Pilot Day 2 | Shubh + Joint review |
| 7 | 2026-06-22 | Pilot Day 3 + mid-pilot checkpoint | Joint |
| 8 | 2026-06-23 | Pilot Day 4 | Shubh + Joint review |
| 9 | 2026-06-24 | Pilot Day 5: final calls, data freeze | Shubh + Joint review |
| 10 | 2026-06-25 | Synthesis + PASS/FAIL/INCONCLUSIVE verdict | Joint |
