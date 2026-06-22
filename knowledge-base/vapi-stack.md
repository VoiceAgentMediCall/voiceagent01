# Vapi + Twilio + Apps Script Stack — Knowledge Base

> Stack as it actually ran on 2026-06-15 (Day 0). This is the **shorter** sibling of [livekit-stack.md](livekit-stack.md). For the longer-lived Phase A architecture we migrated to, read that doc.

---

## 1. TL;DR

| Field | Value |
|---|---|
| What it is | A one-day-old voice-agent pilot stack that puts an outbound AI call (Hindi, medication reminder) on the phone of an elderly parent in India |
| Status as of 2026-06-16 | **Frozen.** Vapi assistant `MediCall Hindi Pilot v0` (ID `0065daae-664a-4780-834f-f215a3879dac`) is still alive but no new calls will be placed from it — we migrated to LiveKit on Day 1 |
| Why it exists | Day-0 deliverable from the [implementation plan](../docs/archive/2026-06-15-medicall-implementation-plan.md): "first dial tone today, don't optimise" |
| Why we left it | Vapi's custom-provider API rejected Sarvam's STT/TTS endpoint shape. We need Sarvam for Hindi quality and for Phase B (5 more Indic languages). See [§13 Decision log](#13-decision-log) |
| First real test call | 2026-06-15 ~17:00 IST, 42 seconds, to +91 8104 348 262 (Shubh's own number), $0.05 Vapi spend, ended cleanly. Only Day-0 call we placed |
| Cost per 30s call (with Vapi defaults) | ~$0.058 (~₹4.85). Breakdown in [§4](#4-cost-breakdown-per-call) |
| Operator surface | **Click "Dial" in the Vapi dashboard.** That's it. No code path triggers a call |
| Maintainer skill needed | Reading JSON, pasting into Vapi web UI, deploying a Google Apps Script. No Python, no Docker, no SIP |
| Sibling doc | [livekit-stack.md](livekit-stack.md) — the production-track stack we cut over to on Day 1 |

The pilot was deliberately the **dumbest end-to-end loop that could place a real Hindi call**. Manual dial, Google Sheet as DB, Vapi defaults instead of Sarvam, no auth, no cron. The point was to prove telephony + orchestration + webhook + Sheet write all work in a single day. They did. Then we left.

---

## 2. The 10,000-foot architecture

```
+--------------+   click "Dial"    +----------------+
| Shubh's      |  ---------------> | Vapi dashboard |
| browser      |                   | (web UI)       |
+--------------+                   +-------+--------+
                                            |
                                            | Vapi orchestration runtime
                                            | (Vapi cloud, US region)
                                            v
                              +-----------------------------+
                              |  Vapi assistant             |
                              |  MediCall Hindi Pilot v0    |
                              |                             |
                              |  STT:  Deepgram nova-2 (hi) |
                              |  LLM:  GPT-4o-mini          |
                              |  TTS:  Azure SwaraNeural    |
                              |  System prompt: Hindi       |
                              +--------+-----------+--------+
                                       |           |
                  PCM audio in/out     |           | end-of-call webhook
                                       v           v
                              +----------------+   +-----------------------+
                              | Twilio voice   |   | Google Apps Script    |
                              | trunk          |   | /exec endpoint        |
                              | +1 814 524 3223|   | (POST receiver)       |
                              +--------+-------+   +----------+------------+
                                       |                      |
                       PSTN (transoceanic, ~200-400ms RTT)    |
                                       v                      v
                              +----------------+   +-----------------------+
                              | Parent's       |   | Google Sheet          |
                              | mobile (+91)   |   | "medicall-pilot-log"  |
                              +----------------+   | call_logs tab         |
                                                   +-----------------------+
                                                              ^
                                                              | (operator
                                                              |  reads, sends
                                                              |  WhatsApp
                                                              |  recap to
                                                              |  caregiver)
```

### Component table

| Component | What it does | Vendor / file | Day-0 instance ID |
|---|---|---|---|
| Trigger | Operator clicks a button | Vapi web UI | n/a |
| Orchestration | Sequences STT → LLM → TTS turns, manages barge-in, fires end-of-call webhook | Vapi.ai (assistant) | `0065daae-664a-4780-834f-f215a3879dac` |
| STT (speech-to-text) | Converts Hindi audio to text | Deepgram `nova-2` via Vapi default | n/a |
| LLM (large language model) | Picks next assistant utterance | OpenAI `gpt-4o-mini` via Vapi default | n/a |
| TTS (text-to-speech) | Speaks text in Hindi | Azure Cognitive `hi-IN-SwaraNeural` via Vapi default | n/a |
| Phone trunk | Carries audio between Vapi cloud and the public phone network | Twilio "phone number" import (Vapi auto-handles carrier integration) | `fbac2c71-a272-4e3f-889f-284f5587b1c8` |
| Twilio number | The +1 number that displays on the parent's phone | Twilio US Local Voice number | `+1 814 524 3223` |
| Webhook target | Receives the JSON Vapi posts when a call ends | Google Apps Script Web App | URL ends `/AKfycbzcplIZ.../exec` |
| Outcome DB | Stores one row per call | Google Sheet `medicall-pilot-log` (tabs `schedule`, `call_logs`, `error_log`) | n/a |
| Caregiver notification | Operator types a WhatsApp message to the caregiver after each call | Manual (Shubh's fingers) | n/a |

Footnote on jargon: a "webhook" is just a URL that one service POSTs JSON to when an event happens — like a phone number a service can call back on. "PSTN" is the public phone network ("Public Switched Telephone Network").

---

## 3. The journey of a single phone call

Sequence for the 42-second self-test placed at ~17:00 IST on 2026-06-15.

| Step | T+ | Where | What happens |
|---|---|---|---|
| 1 | 0s | Vapi dashboard, Shubh's browser | Shubh selects assistant `MediCall Hindi Pilot v0`, types `+918104348262` into the "Test Call" field, clicks Dial |
| 2 | <1s | Vapi cloud (US region) | Vapi creates a call object, allocates an orchestration session, opens an outbound SIP leg to Twilio |
| 3 | 1-3s | Twilio | Twilio's US gateway accepts the call, picks an outbound route to India, dials +91 8104 348 262 using the +1 814 524 3223 number as caller ID |
| 4 | 3-10s | India mobile network (Airtel) | Phone rings. Shubh's phone displays "+1 (814) 524-3223" (US number — important caveat: parents will see this same US number on their phone) |
| 5 | ~10s | Phone | Shubh picks up. Audio path establishes both directions |
| 6 | 10-11s | Vapi orchestration | Vapi plays the first message via Azure TTS: "Namaste, main MediCall se bol raha hoon..." |
| 7 | 11-14s | Audio loop | Deepgram STT streams partial transcripts of Shubh's reply as he speaks. When Deepgram emits `is_final=true`, the transcript is shipped to GPT-4o-mini |
| 8 | 14-15s | GPT-4o-mini | Generates next assistant utterance based on the system prompt and the conversation so far |
| 9 | 15-16s | Azure TTS | Streams audio of the next utterance back through Vapi to Twilio to Shubh's phone |
| 10 | 16-42s | repeat steps 7-9 | Several conversational turns. Hindi quality was passable but obviously synthetic (Azure SwaraNeural is not Sarvam) |
| 11 | 42s | Vapi orchestration | Either Shubh hung up OR the assistant ended the call OR a max-duration timer fired. The exact `endedReason` was logged but not reviewed |
| 12 | 42s + ~1s | Vapi cloud | Vapi POSTs an `end-of-call-report` JSON payload to the Apps Script `/exec` URL configured on the assistant |
| 13 | ~43s | Google Apps Script | `doPost(e)` parses the payload, runs `extractVapiFields_()`, runs `mapOutcome_()` against `endedReason` + summary, appends a row to `call_logs` tab. (Important: this was Day-0 `webhook.gs`, the v1 file. The v2 dual-stack file at `voiceagent/scaffolds/webhook_v2.gs` came on Day 1 to handle both Vapi and LiveKit payloads. v1 has since been deleted) |
| 14 | ~44s | Google Sheet | A new row appears in the `call_logs` tab. Operator visually confirms it landed |
| 15 | n/a | Vapi dashboard | Call shows up under "Calls" with cost $0.05, duration 42s, transcript downloadable as text |
| 16 | n/a | Operator | If this were a real pilot call (not a self-test), Shubh would now WhatsApp the caregiver a recap using the template in [`voiceagent/docs/archive/2026-06-15-day0-runbook.md §4`](../docs/archive/2026-06-15-day0-runbook.md) |

Total elapsed wall-clock from button-click to a row appearing in a Sheet: ~45 seconds.

---

## 4. Cost breakdown per call

Vapi is **mostly bundled** — but only the orchestration layer. STT, TTS, LLM are pass-through, billed at their providers' published rates plus a small Vapi markup. **Twilio is billed separately on the Twilio account.**

### Per-minute rate card (Day-0 stack)

| Line item | Vendor | Rate | Account billed |
|---|---|---|---|
| Vapi orchestration | Vapi.ai | $0.05 / min | Vapi PAYG balance |
| STT (Deepgram nova-2) | Deepgram (via Vapi) | ~$0.0043 / min | Vapi PAYG balance (pass-through + markup) |
| TTS (Azure SwaraNeural) | Microsoft Azure (via Vapi) | ~$16 / 1M chars (~$0.005 / min assuming ~300 chars/min spoken) | Vapi PAYG balance |
| LLM (GPT-4o-mini) | OpenAI (via Vapi) | $0.15 / 1M input + $0.60 / 1M output tokens (~$0.001-0.002 / min for short Hindi turns) | Vapi PAYG balance |
| Twilio outbound to India mobile | Twilio | $0.0496 / min | Twilio trial credit ($14.35 remaining) |

### 30-second call (the 2026-06-15 self-test was 42s — round to 30s for the per-30s line)

| Line item | Cost (USD) | Cost (INR ~₹83) | % of total |
|---|---|---|---|
| Vapi orchestration (0.5 min × $0.05) | $0.025 | ₹2.08 | 43% |
| Twilio outbound (0.5 min × $0.0496) | $0.025 | ₹2.06 | 43% |
| Azure TTS (~150 chars assistant speech) | $0.005 | ₹0.42 | 9% |
| Deepgram STT (0.5 min × $0.0043) | $0.002 | ₹0.18 | 3% |
| GPT-4o-mini (~500 tokens total) | $0.001 | ₹0.08 | 2% |
| **Total (30s)** | **~$0.058** | **~₹4.85** | 100% |

### 60-second call

| Line item | Cost (USD) | Cost (INR) |
|---|---|---|
| Vapi orchestration | $0.050 | ₹4.15 |
| Twilio outbound | $0.050 | ₹4.13 |
| Azure TTS (~300 chars) | $0.010 | ₹0.83 |
| Deepgram STT | $0.004 | ₹0.36 |
| GPT-4o-mini (~1000 tokens) | $0.002 | ₹0.17 |
| **Total (60s)** | **~$0.116** | **~₹9.65** |

### 90-second call (close to the spec's hard cap)

| Line item | Cost (USD) | Cost (INR) |
|---|---|---|
| Vapi orchestration | $0.075 | ₹6.23 |
| Twilio outbound | $0.075 | ₹6.20 |
| Azure TTS | $0.015 | ₹1.25 |
| Deepgram STT | $0.006 | ₹0.54 |
| GPT-4o-mini | $0.003 | ₹0.25 |
| **Total (90s)** | **~$0.174** | **~₹14.50** |

### Verified vs estimate

| Cost line | Verified or estimate |
|---|---|
| Vapi $0.05/min orchestration | **Verified** — Vapi dashboard showed exactly $0.05 for the 42s test call (rounded up to 1 minute internally) |
| Twilio $0.0496/min to India mobile | Verified per Twilio published pricing |
| Deepgram, Azure, OpenAI sub-rates | ~estimate based on public per-min and per-token rates. Vapi adds a small undisclosed markup |

### What the pilot would have actually cost (had we run it on Vapi)

25 calls × ~60s avg = 25 minutes of airtime = **~$2.90 (~₹240) total**. Well within Twilio trial credit + Vapi initial credit. We never spent it.

---

## 5. Vendor + service role table

| Vendor / service | Role | Why it's here | Cost basis | Failure impact |
|---|---|---|---|---|
| **Vapi.ai** | Orchestrates STT → LLM → TTS turns, manages the call session, fires webhooks | Fastest path to a working Hindi voice agent without writing Python. Browser config, no code | $0.05/min + pass-through STT/TTS/LLM | If Vapi goes down: no calls can be placed at all. No fallback in this stack |
| **Twilio (US)** | Provides the +1 number that Vapi rents as an outbound carrier | Vapi's "Phone Number" import is the simplest way to get a working outbound trunk in <10 minutes. Twilio's $15 trial credit covered the entire pilot | $0.0496/min to India mobile + $1.15/month number fee | If Twilio rejects the call (CARRIER_FAIL) the operator sees an error in Vapi UI. Fallback: re-verify the destination as a Twilio Caller ID; if blocked, would have needed to top up Twilio out of trial |
| **Deepgram nova-2 (Hindi)** | STT — converts incoming Hindi audio to text | Vapi default for Hindi. **Not what we wanted** — Sarvam Saaras is more accurate on Indian Hindi accents, but Vapi's custom-provider integration to Sarvam failed | ~$0.0043/min via Vapi | If Deepgram misfires, the LLM gets garbage transcripts → assistant produces non-sequiturs. Logged as `STT_GARBLED` |
| **Azure hi-IN-SwaraNeural TTS** | TTS — speaks the assistant's responses in Hindi | Vapi default. Acceptable for Day-0 smoke test; obviously synthetic to a native ear | ~$16/1M chars via Vapi | If Azure 5xx's, Vapi silently fails-over to a default fallback voice (English) — would have been audible in a real call |
| **OpenAI GPT-4o-mini** | LLM — picks the next assistant utterance from the system prompt + dialogue history | Vapi default. Cheap, decent at instruction-following, multilingual | $0.15/1M input + $0.60/1M output tokens via Vapi | If OpenAI 5xx's, Vapi raises `assistant-error` → call ends with `endedReason: assistant-error` → mapped to NO_ANSWER |
| **Google Sheets** | Outcome database; one row per call | Zero-setup; operator can sort/filter/export to CSV from the same tab they use to schedule. Two tabs: `schedule` (input), `call_logs` (output) | Free | If Sheets is down: webhook errors get logged to the `error_log` tab (which is also in Sheets, so this fallback is shaky). In practice Sheets uptime has not been an issue |
| **Google Apps Script (Web App)** | Webhook receiver; parses Vapi JSON, normalises into 7 columns, appends to `call_logs` | Free, hosted by Google, no server to maintain, deploys with two clicks. Tied to the same Google account that owns the Sheet | Free (quota: 20K requests/day on free tier — irrelevant at pilot volume) | If Apps Script returns non-200, Vapi retries with default backoff. Webhook code has idempotency check on `call_id` to dedupe |
| **WhatsApp (manual)** | Operator → caregiver recap channel | "Shubh's finger, not an API" — pilot explicitly chose not to wire WhatsApp Business API. Zero engineering, full control over wording | Free (Shubh's own WhatsApp) | If Shubh forgets, no recap. Caregiver experience degrades. Logged in the failure-mode log |

What's deliberately **NOT here** that the master plan listed:
- No Sarvam (failed to wire — that failure is exactly why we migrated)
- No Exotel (deferred — see [§13](#13-decision-log))
- No QStash / cron (manual trigger only)
- No Supabase (Sheets is the DB)
- No JWT / auth / Clerk (no users besides the operator)
- No Veryfi OCR (no prescription parsing)
- No escalation logic (no 3-strike retry)

---

## 6. File-by-file walkthrough

Every file in `voiceagent/` that belonged to the Vapi stack. **Bold** = still alive, *italic* = deleted post-migration.

| Path | Status | What it is / does | Edit policy |
|---|---|---|---|
| **`voiceagent/twilio_credentials.txt`** | Alive | Twilio Account SID, Auth Token, +1 814 524 3223 trial number, verified caller-ID list | Operator-edit. Rotate Auth Token post-pilot |
| **`voiceagent/twilio_recovery_code.txt`** | Alive | Twilio 2FA backup recovery code (one-time use) | Touch only if locked out |
| **`voiceagent/vapi_api_key.txt`** | Alive | Vapi private/server API key for the assistant | Rotate post-pilot. Used only by Vapi web UI sessions and ad-hoc curl |
| **`voiceagent/sarvam_api_key.txt`** | Alive but unused by Vapi stack | Sarvam API key. **Relevant here only because we tried + failed to wire Sarvam into Vapi.** Now used by the LiveKit stack | See [livekit-stack §7](livekit-stack.md#7-external-accounts--api-keys) |
| `voiceagent/scaffolds/vapi_assistant.json` | Referenced in [SESSION_HANDOFF_v2.md](../docs/SESSION_HANDOFF_v2.md) but not in current tree | The assistant config JSON that was pasted into the Vapi dashboard on Day 0 | Source of truth was the dashboard, not this file |
| *`voiceagent/scaffolds/webhook.gs`* | **Deleted post-migration** | Day-0 single-stack webhook receiver. Parsed only Vapi `end-of-call-report` payloads, wrote 6 columns + raw JSON to `call_logs` | Replaced wholesale by `webhook_v2.gs` on Day 1 |
| **`voiceagent/scaffolds/webhook_v2.gs`** | Alive — **currently active webhook** | Dual-stack version. Routes payload to either `extractVapiFields_()` or `extractLiveKitFields_()` based on a `stack` field on the payload. Adds a `stack` column to `call_logs`. Idempotency check on `call_id`. Errors written to `error_log` tab | Edit when adding a new outcome type or a new payload shape |
| **`voiceagent/scaffolds/schedule_template.csv`** | Alive | Schema for the `schedule` tab: `parent_name, phone_e164, drug_name, dose_time, language` | Copy into a new Sheet when starting a new pilot |
| **`voiceagent/scaffolds/call_logs_template.csv`** | Alive | Schema for the `call_logs` tab. v2 schema has the `stack` column inserted between `duration_sec` and `raw_payload_json` | Use the v2 schema for any new sheet |
| **`voiceagent/scaffolds/trigger_call.md`** | Alive (referenced in handoff) | PowerShell snippet for placing a Vapi call via curl, bypassing the dashboard. Day-0 backup trigger | Operator-edit |
| **`voiceagent/docs/2026-06-15-medicall-pilot-mvp-design.md`** | Alive | The locked spec the pilot was scoped against | Read-only |
| **`voiceagent/docs/2026-06-15-medicall-prd-trd.md`** | Alive | PRD + TRD. Originally Vapi-as-primary; updated to LiveKit-as-primary on Day 1 | Updated as architecture evolves |
| **`voiceagent/docs/archive/2026-06-15-day0-runbook.md`** | Alive in archive | Operator runbook: pre-flight, daily ops, escalation, failure-mode log template | Read-only history |
| **`voiceagent/docs/archive/2026-06-15-medicall-implementation-plan.md`** | Alive in archive | Day 0-10 plan (Sarvam-on-Vapi version). Now historical | Read-only history |
| **`voiceagent/docs/SESSION_HANDOFF_v2.md`** | Alive | End-of-Day-0 handoff doc; records the decision to migrate | Read-only |
| **`voiceagent/reference/master_plan.txt`** | Alive | Original Phase-A-as-MVP master plan that the spec was scoped down from | Read-only |
| **`voiceagent/reference/validation_doc.txt`** | Alive | Mom Test / Jobs-to-be-Done framework writeup, used to design the pilot's pass/fail criteria | Read-only |

**Files that exist but belong to the LiveKit stack (skip here):** everything under `voiceagent/livekit/`, `voiceagent/admin-panel/`, `voiceagent/browser-test/`, `voiceagent/evals/`, and the LiveKit docs (`2026-06-15-livekit-migration-plan.md`, `2026-06-16-livekit-day1-runbook.md`, `livekit-provisioning-and-twilio-sip.md`, etc.). See [livekit-stack §6](livekit-stack.md#6-file-by-file-walkthrough).

---

## 7. External accounts + API keys

| Account | Owner | Where credentials live | Day-0 balance | Rotation policy |
|---|---|---|---|---|
| Vapi.ai | `dasshriyans2802@gmail.com` | `voiceagent/vapi_api_key.txt` (private/server key) | 9.95 PAYG credits remaining after the $0.05 self-test (originally $10) | Rotate post-pilot. Key was shared in a Claude transcript on Day 0, treat as semi-exposed |
| Twilio | `dasshriyans2802@gmail.com` | `voiceagent/twilio_credentials.txt` (Account SID + Auth Token + number) | $14.35 trial credit after $1.15/month number fee | Rotate Auth Token post-pilot. **Auth Token grants full account control** — compromise means someone can place outbound calls billed to this account |
| Twilio 2FA recovery | `dasshriyans2802@gmail.com` | `voiceagent/twilio_recovery_code.txt` | One-time use | Touch only if locked out |
| Sarvam.ai | `dasshriyans2802@gmail.com` | `voiceagent/sarvam_api_key.txt` | 98 of 100 sign-up credits (~₹980/$11.80 — Day-0 wire attempt didn't actually consume any) | Rotate post-pilot. Carried forward to LiveKit |
| Google (Sheets + Apps Script) | `dasshriyans2802@gmail.com` | OAuth — no API key file. Authenticated via Google login in the browser | Free | n/a; Apps Script Web App is deployed as "Execute as: Me, Anyone can access" |
| Vapi end-of-call webhook URL | n/a (URL is the secret) | Embedded in the Vapi assistant config; visible in `voiceagent/docs/SESSION_HANDOFF_v2.md` (last segment redacted: `/AKfycbzcplIZ.../exec`) | Free | Regenerate by redeploying the Apps Script as a new version |

**All four credential files live on Shubh's local laptop only.** None are committed to git (`voiceagent/.gitignore` covers them). If `voiceagent/` ever becomes a git repo, ensure `.gitignore` is honoured before the first commit.

---

## 8. How to operate it

Even though we don't intend to use this stack again, the runbook is preserved for the case where the LiveKit stack is broken and we need a fallback. Detailed source: [`voiceagent/docs/archive/2026-06-15-day0-runbook.md`](../docs/archive/2026-06-15-day0-runbook.md).

### Boot (pre-call checklist, ~5 min)

| Step | Action |
|---|---|
| 1 | Log into `dashboard.vapi.ai`. Confirm assistant `MediCall Hindi Pilot v0` (ID `0065daae-664a-4780-834f-f215a3879dac`) is present |
| 2 | Confirm the assistant has the Twilio number `+1 814 524 3223` attached under "Phone Number" |
| 3 | Confirm the assistant's Server URL field points to the Apps Script `/exec` URL |
| 4 | Open `medicall-pilot-log` Sheet, `schedule` tab. Confirm target phone is in `phone_e164` column (E.164 format, e.g. `+918104348262`) |
| 5 | Confirm target phone is on Twilio's "Verified Caller IDs" list (trial-account restriction — outbound only to verified numbers) |
| 6 | Open `call_logs` tab in a second browser tab; this is where the row will appear |

### Place a call (~1 min + call duration)

| Step | Action |
|---|---|
| 1 | Vapi dashboard → assistant → "Test Call" button |
| 2 | Paste E.164 phone (`+91XXXXXXXXXX`) into "Phone Number" field |
| 3 | Click "Dial" |
| 4 | Phone rings on the parent's end. Vapi dashboard shows live transcript |
| 5 | When call ends, Vapi posts the end-of-call JSON to the Apps Script `/exec` URL |

### Monitor (during call)

| Where | What to watch for |
|---|---|
| Vapi dashboard "Live Monitor" | Live transcript, current latency, current call cost |
| Real-time audio | Either parent or assistant talks over the other → flag as `LATENCY_BAD` |
| Anything off-script | Medical advice, drug-name invention, dose alteration → **STOP THE PILOT**, log as `GUARDRAIL_VIOLATION` |

### After call (~30 sec)

| Step | Action |
|---|---|
| 1 | Confirm a row appeared in `call_logs` within 30s. If not, check Apps Script execution log (`script.google.com` → project → Executions) and the `error_log` tab |
| 2 | Read the `outcome` cell. Confirm it matches what you heard (CONFIRMED / DENIED / NO_ANSWER) |
| 3 | If real pilot call: WhatsApp the caregiver using the recap template from runbook §4 |
| 4 | Update the failure-mode log if anything was unusual |

### Stop

The pilot is event-driven, not a long-running process. There is nothing to "stop". To prevent any further calls: detach the phone number from the assistant in the Vapi dashboard, or pause the assistant.

---

## 9. Failure-mode handbook

Mapped to the failure-type vocabulary from the [Day-0 runbook §6](../docs/archive/2026-06-15-day0-runbook.md). Use these strings exactly when logging incidents.

| Symptom | Failure type | Likely cause | Where to look | Fix |
|---|---|---|---|---|
| Phone never rings; Vapi shows `failed` | `CARRIER_FAIL` | Twilio number not attached, or destination not in Twilio Verified Caller IDs, or Twilio out of trial credit | Twilio Console → Phone Numbers; Vapi assistant config | Re-attach number; verify Caller ID via Twilio "Verified Caller IDs"; top up Twilio if balance < $1 |
| Phone rings, parent picks up, hears silence | `LATENCY_BAD` (>2s before greeting) or TTS failed | Cold-start latency on Azure TTS, or Vapi failed to receive first LLM token in time | Vapi call log → "Provider breakdown" tab | If Azure TTS shows non-200, retry the call. If consistent, switch the assistant's voice to a different Azure voice or to ElevenLabs |
| Parent answers, assistant produces gibberish | `HALLUCINATION` or `STT_GARBLED` | STT mis-transcribed Hindi → LLM produced response to garbage input | Vapi dashboard → call → transcript view | Hard stop; fix the system prompt to add "if user input is unintelligible, ask once politely to repeat, then end call" |
| Assistant talks while parent is talking | `PROMPT_LOOP` or talk-over | `responseDelaySeconds` too low, or VAD (voice activity detection) too aggressive | Vapi assistant config | Raise `silenceTimeoutSeconds` and `responseDelaySeconds` to 1.5s; retest |
| Call hits 90s without ending | Timeout / prompt loop | Assistant failed to recognise end-call intent | Vapi config `maxDurationSeconds` | Set `maxDurationSeconds: 90` hard cap; mark these as `DENIED (timeout)` |
| Call ends but no row in `call_logs` | Webhook failure | Apps Script not redeployed after edit, or `/exec` URL stale on Vapi side | Apps Script → Executions, Vapi assistant → Server URL field | Redeploy Apps Script as "New version", copy fresh `/exec` URL, paste into Vapi assistant Server URL |
| Row appears in `call_logs` but `outcome=NO_ANSWER` when parent clearly answered | `mapOutcome_()` mismatched the Vapi payload | The summary field didn't contain the keywords we look for | `call_logs` `raw_payload_json` column | Read the raw JSON; tune `mapOutcome_()` keyword list in `webhook_v2.gs`; redeploy |
| Two rows for the same call | Webhook retry / Vapi delivered twice | Apps Script returned non-200, Vapi retried | `call_logs` rows by `call_id` in raw JSON | Idempotency check in `isDuplicate_()` should catch this. If not, deduplicate manually + investigate why the function missed |
| Parent mentions any symptom | `SYMPTOM_REPORTED` | Working as designed | n/a | Assistant ends the call per system-prompt guardrail. Within 5 min, WhatsApp the caregiver the symptom **verbatim** from the transcript — do not paraphrase, do not give medical advice |
| Assistant gives medical advice / suggests dose change | `GUARDRAIL_VIOLATION` | LLM ignored system prompt | Transcript | **PAUSE THE PILOT IMMEDIATELY.** Fix the prompt. Do not resume same day |
| Vapi balance suddenly halved | Retry storm | Webhook 5xx caused Vapi to retry many times, or a stuck call wasn't terminated | Vapi dashboard → Calls log | Stop all calls. Inspect call durations. Audit Apps Script for 5xx |

---

## 10. Latency budget

Where each ms of round-trip latency went on the Day-0 self-test. P95 target from the spec is **<1.2 seconds turn latency** (relaxed from the master plan's 800ms because of Twilio transoceanic routing).

| Segment | Estimated ms | Why |
|---|---|---|
| User stops speaking → Deepgram emits final transcript | ~250-400ms | Deepgram nova-2 streaming endpoint, plus VAD silence window |
| Final transcript → Vapi orchestrator → GPT-4o-mini first token | ~150-300ms | OpenAI cold-start variance; gpt-4o-mini is faster than 4o |
| GPT-4o-mini final token → Azure TTS first byte of audio | ~150-250ms | Azure SwaraNeural streaming; first chunk is the slow part |
| Azure TTS audio → Vapi → Twilio → India mobile speaker | ~250-500ms | **Transoceanic — the big variable.** US-East ↔ India over PSTN voice path. Can spike to 600ms+ on congested routes |
| Vapi orchestration overhead (queue, scheduling, glue) | ~50-100ms | Internal Vapi processing |
| **Total typical** | **~850-1550ms** | At the high end this is audibly bad |

### What this means in practice

| Latency bucket | Conversational feel |
|---|---|
| < 800ms | Feels like a normal phone call |
| 800ms - 1.2s | Slightly slow; elderly parent may start speaking over the AI |
| 1.2s - 1.8s | Awkward pauses; the parent thinks the call dropped |
| > 1.8s | Often unrecoverable; parent hangs up |

We never measured Day-0 P95 with statistical rigour. The 42s self-test "felt OK" subjectively but Shubh was in the same room as the laptop, not on a real India mobile cell. **Latency contamination of the engagement signal** is the single biggest reason we moved to LiveKit + a future India SIP endpoint.

---

## 11. Pros + cons of this stack

| Pros | Cons |
|---|---|
| **5-minute setup**: paste config in Vapi UI, click. No Python, no Docker, no SIP knowledge | Vapi orchestration cost ($0.05/min) is ~3x what LiveKit Cloud would charge (~$0.025/min). At any reasonable scale this matters |
| **Browser dashboard with live monitor** is a genuine DX win — operator can listen to a live call and see transcript stream | Vapi's custom-provider integration is rigid; **Sarvam STT/TTS endpoint shape was rejected** (the migration trigger). See [LiveKit comparison §5](livekit-stack.md#5-vendor--service-role-table) where Sarvam works as a first-class plugin |
| Bundled call recording, transcript download, cost-per-call view out of the box | Audio data resides on Vapi infra (US region). **DPDP-problematic** if we ever ship to production. See [§B](#b-dpdp--data-residency-posture) |
| Apps Script + Sheet is a viable PM-friendly outcome store — a non-technical PM can sort the rows and export to CSV without a SQL client | No version control for the assistant config beyond a scaffolded JSON. Prompt changes are made in the Vapi UI, not Git, so prompt drift between Days 5-9 would not have been attributable to specific changes |
| Twilio number import is a one-click trunk integration. No SIP credential management | Twilio +1 caller ID **contaminates the engagement signal** — parents see a US number, not a familiar +91. (LiveKit doesn't fix this either, but it unlocks the path to Exotel +91 later) |
| Manual dial via dashboard suits a pilot ("watch every call live") | No native eval framework. Promptfoo / Langfuse don't integrate without writing a custom Vapi-to-trace adapter. Compare to LiveKit, which has both [as planned](livekit-stack.md#11-pros--cons-of-this-stack) |
| Total Day-0 build time: ~6 hours from "do I have a Vapi account" to first dial tone | No path to multi-language Phase B without Sarvam. Deepgram supports Hindi, but adding Odia / Bengali / Tamil / Telugu / Malayalam means 5 more vendor wires (each at the same custom-provider friction) |

See [livekit-stack §11](livekit-stack.md#11-pros--cons-of-this-stack) for the cross-stack comparison.

---

## 12. What this stack does NOT do

| Out of scope | Why | Where this work lives instead |
|---|---|---|
| Automatic call scheduling (cron / queue) | Pilot intentionally manual to enable live monitoring | LiveKit `dial.py` + future QStash trigger |
| 3-strike retry on NO_ANSWER | Spec dropped retries to keep dialogue scope minimal | Phase A scope, master plan §A4 |
| Symptom-escalation → caregiver auto-alert | Wire was deferred to manual WhatsApp by operator | Phase A scope, master plan §A4 |
| Caregiver dashboard / web UI | Sheet is the only UI | Phase A scope, master plan §A5 |
| OCR of prescription photos | Manual schedule entry only | Phase A scope, master plan §A2 (Veryfi) |
| DPDP digital consent (OTP relay) | Replaced with verbal consent from caregiver | Post-pilot work |
| Multi-language (Odia, Bengali, Tamil, Telugu, Malayalam) | Hindi only | Phase B; blocked on Sarvam (hence LiveKit) |
| Sarvam STT/TTS for higher Hindi quality | Vapi custom-provider rejected Sarvam endpoint shape | LiveKit native Sarvam plugins |
| Voicemail detection (distinguish parent vs answering machine) | Vapi has no built-in VAD-based voicemail detection | LiveKit + Silero VAD |
| Prompt version control + evals | No Git workflow possible for prompts in Vapi UI | Langfuse + Promptfoo on LiveKit |
| Auth / multi-tenant | Single operator, no users | Phase A, Clerk free tier in LiveKit stack |

---

## 13. Decision log

In rough chronological order across Day 0.

| # | Decision | When | Why |
|---|---|---|---|
| 1 | **Twilio over Exotel for the pilot** | Day 0 morning | Exotel's onboarding is sales-led ("Talk to an Expert", enterprise quotes via email per their public pricing page), likely needs an Indian company KYC, and could eat 2-5 days of the 5-10 day window. Twilio is self-serve with a $15.50 trial credit and an instant API key. Pilot total airtime is ~12 minutes; the cost difference between carriers is <$1. **Trade-off accepted:** parents see a US number (+1 814 524 3223), which contaminates the "cold +91 engagement" signal — but every parent is a pre-briefed warm contact so the contamination is bounded. Exotel onboarding starts in parallel post-pilot |
| 2 | **Google Sheet over Supabase** | Day 0 morning | Operator (Shubh) needs to sort, filter, and read transcripts daily without a SQL client. Sheet doubles as the schedule input. Free, zero setup, exportable to CSV. Supabase would have meant Row-Level Security policies, a migration file, a client SDK, and a dashboard query layer — all overkill for 25 rows |
| 3 | **Manual dial over automated cron** | Day 0 morning | Pilot's deliberate design: operator watches every call live and iterates the prompt between attempts. An automated cron would have meant either (a) building a queue (QStash + worker) or (b) writing a tiny Apps Script trigger — both of which add a moving part to debug while we're still validating the dialogue. Manual dial = zero new code path. Re-litigated this on Day 1 LiveKit migration; will revisit when prompt is stable |
| 4 | **Warm-contact verbal consent over DPDP OTP relay** | Day 0 morning | DPDP-compliant proxy consent (caregiver receives an OTP, reads it to parent who reads back) is real engineering. For 5 warm contacts with verbal caregiver consent, regulatory exposure is essentially nil at this scale. Spec explicitly defers DPDP OTP UX validation to first post-pilot sprint |
| 5 | **Vapi over LiveKit (initially)** | Pre Day 0 / spec lock | At the time of spec writing, Vapi looked like the fastest path to first dial tone: browser UI, no Python, custom-provider docs for Sarvam looked sufficient. LiveKit Agents was on the radar but appeared higher-touch (Python framework, deployment). **The bet:** plug Sarvam in via Vapi custom-provider on Day 1, get Hindi quality + Vapi DX. **What broke the bet:** see #6 |
| 6 | **Migrate Vapi → LiveKit on Day 1** | End of Day 0 | Two facts forced the call: (a) Vapi's custom-provider integration rejected Sarvam's STT/TTS endpoint shape (confirmed via Vapi API error), so we couldn't get Sarvam Hindi quality through Vapi without building a proxy ("worst of both worlds"); (b) Phase B's 5 additional Indic languages are not realistic on Deepgram/Azure quality, while Sarvam has all of them. LiveKit has **native** Sarvam plugins (STT/TTS/LLM), Cloud is ~3× cheaper at scale (~$0.025/min vs Vapi's effective $0.08/min for our path), and DPDP self-host is a viable Phase A path. Migration plan: [`voiceagent/docs/2026-06-15-livekit-migration-plan.md`](../docs/2026-06-15-livekit-migration-plan.md) |
| 7 | **Keep the Vapi assistant alive (don't delete) and webhook dual-stack** | End of Day 0 | If LiveKit doesn't reach quality bar by Day 4, we can fall back to Vapi for Days 5-9 of the engagement pilot. The Sheet remains the union store via `webhook_v2.gs`, which routes Vapi and LiveKit payloads to the same `call_logs` tab with a `stack` column for A/B analysis |
| 8 | **Apps Script Web App over a hosted Express server** | Day 0 morning | One file, two clicks to deploy ("Deploy → Web App → Execute as Me + Anyone"), no DNS, no TLS cert, no server to babysit. The cost: no real version control (the deployed version is whatever was last saved), so prompt and parser changes need careful commit hygiene. Acceptable at pilot scale |

---

## 14. Sample real transcript

We have **exactly one** real call placed on this stack: the Day-0 self-test on 2026-06-15.

### Call metadata

| Field | Value |
|---|---|
| When | 2026-06-15 ~17:00 IST |
| Assistant | `MediCall Hindi Pilot v0` (ID `0065daae-664a-4780-834f-f215a3879dac`) |
| Caller ID | `+1 814 524 3223` (Twilio US number) |
| Destination | `+91 8104 348 262` (Shubh's own verified number) |
| Duration | 42 seconds |
| Cost | $0.05 (Vapi orchestration; Twilio billed separately, ~$0.035 for India mobile) |
| End reason | Logged in Vapi dashboard, not extracted for this doc |
| Outcome (as written to `call_logs`) | Determined by `mapOutcome_()` from the v1 `webhook.gs`. Most likely `CONFIRMED` or `DENIED` based on the test design — see "What was tested" below |

### What was tested

Per the [Day-0 plan §0.6](../docs/archive/2026-06-15-medicall-implementation-plan.md), the self-test was scoped to verify five things in a single call — **not** to evaluate Hindi quality (Day 1's job). The five things:

1. Shubh's phone rings from +1 814 524 3223 (telephony works)
2. Some voice speaks the Hindi greeting from the system prompt (orchestration + TTS work)
3. Vapi dashboard shows the call entry with duration > 0 and a transcript (logging works)
4. Apps Script `/exec` receives the end-of-call POST (webhook fires)
5. A row appears in `call_logs` within ~30s of hangup (parser + Sheet write work)

All five passed. The handoff doc records: *"First end-to-end test call to Shubh succeeded (42s, $0.05 on Vapi). Pilot can run as-is for the 25-call engagement test."* — [SESSION_HANDOFF_v2.md](../docs/SESSION_HANDOFF_v2.md)

### What we don't have

| Missing | Why it's missing |
|---|---|
| Verbatim transcript text | Not exported to docs. Available in Vapi dashboard under the call entry's "Transcript" tab if needed |
| Audio recording link | Same — in Vapi dashboard; not archived to `voiceagent/` |
| Per-turn latency breakdown | Vapi provides this in "Provider breakdown" but Day 0 didn't pull it out |
| Quality judgement of Azure SwaraNeural | Subjective listen only; no formal eval. Day 1 was supposed to swap Azure for Sarvam Bulbul v3 and compare — instead Day 1 swapped to LiveKit |

If the verbatim transcript is needed later: Vapi dashboard → Calls → filter by date 2026-06-15 → select the call → Transcript tab → copy.

---

## 15. Glossary

| Term | Plain English |
|---|---|
| Assistant | A Vapi-internal object that bundles a system prompt + STT + LLM + TTS + voice settings + webhook config. One assistant per use case |
| Webhook | A URL one service POSTs JSON to when an event happens. Like leaving a phone number for a service to call back on |
| End-of-call report | The specific JSON Vapi posts to your webhook after a call ends, containing transcript, duration, cost, and an `endedReason` field |
| STT | Speech-to-text. Converts spoken audio into text the LLM can read |
| TTS | Text-to-speech. Converts the LLM's text response into spoken audio |
| LLM | Large language model. Picks the next thing the assistant says, given the system prompt and the conversation so far |
| VAD | Voice activity detection. Decides "is the user still talking?" so the STT knows when to ship a final transcript |
| Barge-in | When the user starts talking while the assistant is still talking. Good STT pipelines stop the TTS playback and listen |
| SIP trunk | A "virtual phone line" between a software service (Vapi, LiveKit) and a carrier (Twilio, Exotel). Vapi auto-handles this when you "Import phone number from Twilio" — you don't see the SIP layer |
| PSTN | Public Switched Telephone Network — the global phone network |
| E.164 | The international phone number format: `+91XXXXXXXXXX` (plus sign, country code, no spaces) |
| Caller ID | The number the recipient sees on their phone when it rings |
| Verified Caller ID | A Twilio trial-account restriction: you can only call numbers that you've separately verified via OTP. Lifts when you upgrade out of trial |
| Apps Script | Google's hosted JavaScript runtime, sandboxed to Google services like Sheets. Free, deploys in two clicks |
| Idempotency | Property that running the same operation twice produces the same result. Webhook needs this because Vapi retries failed deliveries |
| Sarvam | India-based AI company; their Saaras (STT), Bulbul (TTS), and 105B (LLM) models are state-of-the-art for Indic languages — the thing we wanted Vapi to use, and the reason we left Vapi |
| Vapi defaults | The STT (Deepgram), LLM (OpenAI), TTS (Azure) stack Vapi ships out of the box. What the Day-0 pilot actually used |
| Custom provider | Vapi's mechanism for plugging in a non-default STT / LLM / TTS via a generic HTTP endpoint contract. **This is what didn't work for Sarvam** |
| DPDP | India's Digital Personal Data Protection Act (2023). Restricts how/where personal data can be stored and processed. Relevant for voice + transcript data |
| TRAI / DLT | Telecom Regulatory Authority of India / Distributed Ledger Technology. India's spam-call / SMS regulatory regime. Twilio is not natively TRAI-compliant; Exotel is |
| PAYG | Pay-as-you-go pricing (vs subscription / commitment) |

---

## A. What happens if you stop paying

| Account | Free tier / trial | What expires | Hard stop |
|---|---|---|---|
| Vapi PAYG | No "free tier" — strictly prepaid balance. Started with $10 sign-up credit, $9.95 left after the test call | Balance hits $0 → next call attempt returns "insufficient funds" error before the call connects | Calls stop. Assistant config + history persist |
| Twilio trial | $15.50 trial credit + 1 free trial number for 30 days | If we never upgrade: trial credit decrements per call; trial number reclaimed after 30 days of no activity; Verified Caller ID list is wiped on trial expiry | The +1 814 524 3223 number gets recycled. We lose it permanently unless we upgrade before expiry |
| Sarvam credit | ₹1,000 sign-up credit, ~₹980 left (unused by Vapi stack) | No time-based expiry per their docs as of 2026-06 | n/a here; relevant for LiveKit |
| Google Sheets / Apps Script | Free tier (15GB Drive, 20K Apps Script requests/day) | None at pilot volume | Quota errors would surface in `error_log` tab |
| OpenAI / Deepgram / Azure (via Vapi) | Billed through Vapi PAYG, no separate account exposure | n/a — Vapi handles | n/a |

**Practical implication:** if we walked away from the Vapi stack today (2026-06-16) and did nothing for 30 days, the +1 number disappears, the Vapi assistant config persists, and the Sheet stays untouched. To resurrect: top up Vapi, buy a new Twilio number, re-attach to assistant. ~1 hour of work.

---

## B. DPDP / data-residency posture

India's Digital Personal Data Protection Act (DPDP, 2023) treats voice recordings + health-context transcripts as personal data with stricter handling expectations.

| Question | Day-0 reality |
|---|---|
| Where does the audio live during the call? | Vapi orchestration runs in Vapi's US-region infra. The audio crosses the Pacific twice (once each way) |
| Where is the recording stored after the call? | Vapi cloud (US region). Accessible via the Vapi dashboard. No India-region option on Vapi PAYG tier |
| Where is the transcript stored? | (a) Vapi dashboard (US), (b) Google Sheet (Google Drive — region depends on Google Workspace settings; for a personal `@gmail.com` account, typically US-region) |
| Who can subpoena the audio/transcript? | US authorities can subpoena Vapi and Google directly. Indian authorities would need to go through MLAT (Mutual Legal Assistance Treaty) — slow, but possible |
| Did we obtain DPDP-valid consent? | **No formal OTP-relay consent.** Instead, verbal caregiver consent + verbal parent assent (pre-brief). Pilot scope is 5 warm contacts; enforcement risk at this scale is essentially nil |
| Data minimization? | No formal purge schedule. Manual deletion planned post-pilot (per spec §Constraints) |

**Verdict:** the Vapi stack is **DPDP-problematic** for any post-pilot production use with real PHI (Protected Health Information — drug names + intake history). The LiveKit stack at least has a self-host fallback that keeps audio in India. See [livekit-stack §B](livekit-stack.md#b-dpdp--data-residency-posture).

---

## C. Vendor SLA reality

Vapi and Twilio publish "99.9%" SLAs. What that looks like at pilot scale of 25 calls over 5 days:

| SLA | Allowed downtime / month | Pilot exposure |
|---|---|---|
| 99.9% | ~43 minutes/month | If a full outage hits during one of the 5 morning windows, ~1 of 25 calls fails. Spec accommodates this with "≥ 3 of 5 parents answer at least one call" — a 1-call carrier failure doesn't tank the pilot |
| 99% | ~7 hours/month | Would meaningfully degrade pilot. Neither vendor is at this tier publicly |
| What's **not** in SLA | Vapi → custom-provider integrations (Sarvam), Apps Script Web App (Google free tier — no SLA), single carrier route quality (Twilio US → India is best-effort) |

**Practical risk:** Vapi has had short STT/TTS provider hiccups in 2025-26 based on community reports (status page incidents). At our pilot volume (5 calls/morning over 5 days), the expected impact is 0-1 affected calls. The 25th call is unlikely to be the one that breaks.

**Status pages to monitor:** `status.vapi.ai`, `status.twilio.com`, `status.openai.com` (for the GPT-4o-mini path), `status.deepgram.com`.

---

## D. What skills a maintainer needs

If we handed this stack to a contractor and walked away:

| Skill | Why needed | Where it shows up |
|---|---|---|
| Reading + writing JSON | Vapi assistant config | One ~150-line JSON pasted in the dashboard |
| Reading the Vapi dashboard UI | Operations, debugging | Daily |
| Basic Google Sheets | Reading `call_logs`, sorting, exporting CSV | Daily |
| Apps Script editing | Webhook changes (new payload shape, new outcome type) | Occasional — when Vapi changes their payload or we add a new outcome |
| Twilio console basics | Verifying caller IDs, monitoring balance, reading carrier error codes | Weekly |
| Reading PSTN error codes | When carrier fails | Rare |
| Hindi reading ability | Reviewing transcripts | Daily during pilot |
| WhatsApp message composition | Caregiver recaps | Daily during pilot |
| Skills NOT needed | Python, Docker, SIP, SQL, DevOps, Kubernetes, secret managers, CI/CD | n/a |

**This is the stack's biggest virtue.** A non-engineer with a half-day of training can run it. Compare to LiveKit, which needs Python + Docker + deployment hygiene. See [livekit-stack §D](livekit-stack.md#d-what-skills-a-maintainer-needs).

---

## E. Compare to the sibling stack

The sibling doc is [livekit-stack.md](livekit-stack.md). Quick cross-reference:

| Dimension | This stack (Vapi) | LiveKit stack |
|---|---|---|
| Status (2026-06-16) | Frozen (one test call placed; not used for real pilot) | Active build; Day 1 of migration |
| TL;DR | [§1](#1-tldr) | [livekit-stack §1](livekit-stack.md#1-tldr) |
| Architecture | Vapi cloud + Twilio + Apps Script + Sheet. No code repo for orchestration | LiveKit Agents Python + Twilio SIP + Langfuse + Promptfoo + admin UI + browser test client. Real code repo |
| STT / LLM / TTS | Deepgram nova-2 / GPT-4o-mini / Azure SwaraNeural (Vapi defaults — Sarvam wire failed) | Sarvam Saaras / Sarvam-105B (with GPT-4o-mini fallback) / Sarvam Bulbul v3 — **native** plugins |
| Twilio integration | Vapi "phone number" import; no SIP knowledge needed | Twilio SIP trunk → LiveKit room dispatch. Real SIP credential management — see [livekit-stack §2](livekit-stack.md#2-the-10000-foot-architecture) and [livekit-twilio-sip research](../docs/research/livekit-twilio-sip.md) |
| Cost per 60s call | ~$0.116 (~₹9.65) | Targeting ~$0.06 (~₹5.00) — LiveKit Cloud at $0.025/min vs Vapi $0.05/min |
| Trigger | Click "Dial" in Vapi UI | Python `dial.py` CLI invocation, future cron |
| Webhook | Apps Script `/exec` (Vapi end-of-call-report shape) | Same Apps Script `/exec` — `webhook_v2.gs` parses both Vapi and LiveKit payloads into the same Sheet |
| Outcome store | Google Sheet `call_logs`, `stack=vapi` | Google Sheet `call_logs`, `stack=livekit` |
| Observability | Vapi dashboard (calls, transcripts, costs) | Langfuse traces (per-turn LLM + STT + TTS spans, audio recording links) — [research](../docs/research/dx-stack-langfuse-promptfoo-adminui.md) |
| Evals | None | Promptfoo scenarios in `voiceagent/evals/scenarios/` |
| Voicemail detection | None | Silero VAD plugin — [research](../docs/research/silero-vad-voicemail.md) |
| Operator surface | Vapi dashboard | Admin UI (Next.js or Streamlit) at the URL TBD on Day 1 |
| Skill bar | JSON + Google Sheets | Python + Docker + LiveKit SDK |
| DPDP path | Vapi US-region only; problematic | LiveKit Cloud (multi-region, may include India) OR LiveKit self-host (audio stays in India) |
| Why we left this stack | Vapi custom-provider rejected Sarvam's endpoint shape; multi-language Phase B impossible without Sarvam | n/a |
| Decision log of the migration | [§13 #6 above](#13-decision-log) | [livekit-stack §13](livekit-stack.md#13-decision-log) |

**One-line summary:** Vapi was the *fastest* way to a working call. LiveKit is the *only* way to a production-quality Indic-language stack. The Day-0 Vapi work was not waste — it proved the spec was achievable end-to-end before we committed to the harder migration.
