# MediCall Pilot — Day-1 LiveKit Cutover Runbook

**Date:** 2026-06-16
**Owner:** Shubh (sole operator)
**Parent specs:** `2026-06-15-livekit-migration-plan.md`, `livekit-provisioning-and-twilio-sip.md`
**Purpose:** First live LiveKit test + DX-layer activation. End state: one real SIP call completes on the LiveKit stack with full observability, evals green, and a side-by-side A/B against the existing Vapi run.
**Duration:** 60-90 min focused, single sitting.

---

## 1. Pre-flight checklist

Tick each item as it is confirmed. Every artifact below was produced in Phase 4 (Day 0 close). All boxes start unchecked at the morning sit-down.

### Artifacts that must exist on disk
- [ ] `voiceagent/livekit/agent.py` — Pipeline agent (STT-LLM-TTS-VAD), Hindi system prompt mirrors Vapi assistant
- [ ] `voiceagent/livekit/requirements.txt` — `livekit-agents`, `livekit-plugins-sarvam`, `livekit-plugins-silero`, `langfuse`, `python-dotenv`
- [ ] `voiceagent/livekit/.env.example` — placeholders for `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SARVAM_API_KEY`, `LANGFUSE_*`
- [ ] `voiceagent/livekit/dispatch_call.py` — CLI helper for SIP-out dispatch (Part E of provisioning doc)
- [ ] `voiceagent/admin-panel/app.py` — Streamlit dashboard reading from `call_logs` sheet + Langfuse API
- [ ] `voiceagent/browser-test/server.py` — local Flask/FastAPI server issuing LiveKit tokens for browser smoke test
- [ ] `voiceagent/browser-test/index.html` — minimal LiveKit JS SDK client (Connect button + audio element)
- [ ] `voiceagent/evals/promptfoo.yaml` — 3 test cases: medication confirmed, no-answer, symptom escalation
- [ ] `voiceagent/evals/eval_harness.py` — wraps agent invocations for headless playback
- [ ] `voiceagent/apps-script/webhook_v2.gs` — adds `stack` column to row write, otherwise identical to v1
- [ ] `docs/livekit-provisioning-and-twilio-sip.md` — Parts A-F (LiveKit project, CLI, Twilio SIP trunk, LK outbound trunk, dispatch snippet, webhook wiring)
- [ ] `docs/2026-06-15-livekit-migration-plan.md` — §7 cutover rules, §9 acceptance criteria

### Credentials that must be in `.env` before Step 7
- [ ] `LIVEKIT_URL` (from cloud.livekit.io project page)
- [ ] `LIVEKIT_API_KEY`
- [ ] `LIVEKIT_API_SECRET`
- [ ] `SARVAM_API_KEY` (copy from `voiceagent/sarvam_api_key.txt`)
- [ ] `LANGFUSE_PUBLIC_KEY`
- [ ] `LANGFUSE_SECRET_KEY`
- [ ] `LANGFUSE_HOST` (cloud.langfuse.com or self-host URL)
- [ ] `TWILIO_SIP_USERNAME` / `TWILIO_SIP_PASSWORD` (from Twilio Elastic SIP trunk created in Step 3)

**Gate:** Step 7 does not start until every box above is ticked.

---

## 2. Morning sequence (60-90 min)

Run sequentially. Do not skip ahead even if a step looks trivial — the whole point of Day 1 is to surface every config gap before it becomes a production fire.

| # | Step | Owner action | Expected outcome | Time |
|---|---|---|---|---|
| 1 | LiveKit project provision | Sign up at `cloud.livekit.io` → create project `medicall-pilot` → copy `LIVEKIT_URL`, API key, API secret into `voiceagent/livekit/.env`. Follow Part A of `docs/livekit-provisioning-and-twilio-sip.md`. | `.env` has 3 LiveKit values, project visible in cloud dashboard | 5 min |
| 2 | Install agent deps | `cd voiceagent/livekit && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`. Then `pip install livekit-cli` or download binary. | `lk --version` works, `python -c "import livekit.agents"` returns no error | 5 min |
| 3 | Twilio Elastic SIP trunk | In Twilio console: Elastic SIP Trunking → create trunk `medicall-livekit` → set termination URI to LiveKit SIP endpoint → set credentials list → attach +1 814 524 3223. Follow Part C of provisioning doc. | Trunk shows green in Twilio, termination URI matches LiveKit project SIP host | 10 min |
| 4 | LiveKit outbound trunk | `lk sip outbound create` with the trunk JSON from Part D. Verify with `lk sip outbound list`. | Trunk ID printed, listed with `status=active` | 5 min |
| 5 | Wire end-of-call webhook | In LiveKit cloud dashboard → Webhooks → add endpoint pointing at the Apps Script `/exec` URL captured on Day 0 (Step 9 of medicall plan). Subscribe to `room_finished` event. Follow Part F. | Webhook saved, test ping from LK dashboard returns 200 | 5 min |
| 6 | Deploy webhook v2 | Open Apps Script project. **First add `stack` column to `call_logs` sheet header row (column L).** Paste `webhook_v2.gs` over the existing webhook file. Save → Deploy → Manage Deployments → New Version. Confirm `/exec` URL is unchanged. | Sheet has `stack` column; new deployment version visible | 5 min |
| 7 | Boot the agent | `cd voiceagent/livekit && python agent.py dev` | Console shows `agent registered, listening for jobs`; no traceback | 3 min |
| 8 | Boot admin UI | New terminal: `cd voiceagent/admin-panel && streamlit run app.py` | Streamlit opens on `localhost:8501`, shows empty Day-1 panel and Langfuse connection OK | 3 min |
| 9 | Boot browser test client | New terminal: `cd voiceagent/browser-test && python server.py` | Server up on `localhost:3000` | 2 min |
| 10 | Browser smoke test | Open `http://localhost:3000` → click **Connect** → say "Hello, kya aap sun rahe ho?" | Agent replies in Hindi within ~1.2s. No echo, no clipping. Langfuse shows a trace within 5s. | 5 min |
| 11 | Run Promptfoo evals | `cd voiceagent/evals && promptfoo eval` | `3 passed, 0 failed`. Each case writes to Langfuse under `eval_run=day1`. | 5 min |
| 12 | First live SIP call | `cd voiceagent/livekit && python dispatch_call.py --to +918104348262 --schedule-row 1` (snippet copied verbatim from Part E of provisioning doc) | Phone rings on +91 8104348262. Pick up. Agent runs the full med-confirm flow. Call ends cleanly. | 5 min |
| 13 | Verify Langfuse trace | Open `cloud.langfuse.com` (or self-host URL) → Traces → filter `session_id` from console log of Step 12 | Single trace with STT span → LLM span → TTS span. Total latency visible. | 3 min |
| 14 | Verify Sheet row | Open `medicall-pilot-log` → `call_logs` tab → bottom row | Row has `stack=livekit`, `outcome` populated, `duration_sec` non-zero | 2 min |
| 15 | A/B comparison call | On Vapi dashboard, dial the same +91 8104348262 with the same schedule row. Listen back-to-back. | Two adjacent rows in `call_logs`: `stack=livekit` and `stack=vapi`. Subjective notes captured in §4 table. | 10 min |

**Total:** ~73 min when nothing breaks.

---

## 3. Acceptance criteria

Lifted verbatim from `2026-06-15-livekit-migration-plan.md §9`. All nine must be true before declaring Day 1 a pass.

- [ ] **AC1.** A real SIP-out call to +91 8104348262 completes end-to-end on the LiveKit stack.
- [ ] **AC2.** Conversation is bilingual Hindi-first, with the same opening line and same guardrails as the Vapi assistant.
- [ ] **AC3.** Turn latency (user-stop-talking → agent-start-talking) is ≤ 1.5s on at least 4 of 5 turns in the live call.
- [ ] **AC4.** End-of-call webhook fires; row appears in `call_logs` with `stack=livekit` within 30s of hangup.
- [ ] **AC5.** Langfuse trace contains STT, LLM, and TTS spans with token + latency telemetry on each.
- [ ] **AC6.** Promptfoo eval suite (`voiceagent/evals/promptfoo.yaml`) passes 3/3.
- [ ] **AC7.** Browser test client can connect and hold a voice conversation locally (proves agent works independent of SIP path).
- [ ] **AC8.** Admin UI renders today's call list and links each row to its Langfuse trace.
- [ ] **AC9.** A/B call against Vapi is recorded with subjective notes captured in §4 below.

---

## 4. Failure modes + fallback

Append one row per incident. Failure-type vocabulary mirrors §6 of the Day-0 runbook so the Day-10 synthesis can group cleanly across stacks.

| Failure mode | Symptom | Likely cause | Fallback action |
|---|---|---|---|
| `SIP_AUTH_FAIL` | Twilio returns 401/403 on outbound INVITE | Credentials list mismatch between Twilio trunk and LK outbound trunk | Re-check Part C and Part D side-by-side. Regenerate Twilio SIP password if needed. Retry with one curl probe before next live call. |
| `NO_AUDIO_ONE_WAY` | Call connects, parent hears nothing OR agent hears nothing | Codec mismatch (Twilio defaults to PCMU; LK plugin may negotiate Opus) or NAT/firewall on outbound RTP | Force PCMU on Twilio trunk. If still broken, capture a `lk room dump` and fall back to Vapi for the day. |
| `NO_AUDIO_BOTH_WAYS` | Call connects, total silence | LiveKit agent did not join the room | Check `agent.py` console — likely a Sarvam plugin import error or missing API key. Restart agent. |
| `VOICEMAIL_FALSE_POSITIVE` | Agent starts speaking while voicemail greeting is still playing | VAD threshold too aggressive | Bump `silero` `min_silence_duration_ms` from 500 → 800. Document in §6 of Day-0 log. |
| `LANGFUSE_TRACE_MISSING` | Call completed, Langfuse shows nothing | `LANGFUSE_*` env vars not loaded into agent process OR network egress blocked | Check `agent.py` startup log for "langfuse initialized". If missing, restart agent after sourcing `.env`. |
| `PROMPTFOO_EVAL_FAIL` | One or more cases red | Prompt drift, or eval rubric too strict | If failure is a real regression — fix prompt before live calls. If rubric is over-strict — loosen rubric, log change, re-run. Never silently ignore. |
| `WEBHOOK_NOT_FIRING` | Call done, Langfuse OK, but no row in sheet | LK webhook misconfigured, or Apps Script deployment URL changed | Replay webhook from LK dashboard "Test" button. If still nothing, redeploy Apps Script as new version and re-paste URL into LK. |
| `STACK_COLUMN_MISSING` | Apps Script throws "column L not found" | Step 6 was skipped | Add `stack` header to `call_logs` column L. Re-run webhook test. |
| `LATENCY_REGRESSION` | Turn latency > 1.5s consistently | Cold model load, or Sarvam region mismatch | First call after agent boot is always slow — discard it. If second call also slow, check Sarvam plugin region config. |
| `LIVEKIT_ROOM_LEAK` | `lk room list` shows rooms still active after hangup | Agent crashed mid-call without releasing | `lk room delete <name>`. Restart agent. File under `OTHER` in failure log with note. |

**Hard fallback rule:** if any failure mode in this table blocks the live call (Steps 12-15) and cannot be resolved in 15 min, **abort the LiveKit cutover for the day, run the day's pilot calls on Vapi, and reschedule Day 1 for the next morning.** Do not push live patients onto an unstable stack.

---

## 5. A/B subjective comparison (filled during Step 15)

| Dimension | Vapi | LiveKit | Winner | Notes |
|---|---|---|---|---|
| Voice naturalness (1-5) | | | | |
| Hindi pronunciation (1-5) | | | | |
| Turn latency feel (1-5) | | | | |
| Interruption handling (1-5) | | | | |
| Transcript fidelity (1-5) | | | | |
| Outcome correctness (1=correct, 0=wrong) | | | | |

---

## 6. Cutover decision rules

From `2026-06-15-livekit-migration-plan.md §7`. The decision is taken at the end of Day 1 based on §5 above plus the acceptance criteria in §3.

| Condition | Decision |
|---|---|
| LiveKit matches or beats Vapi on **all four** of: voice quality, latency, outcome rate, transcript intelligibility | **Full cutover at Phase A** — all subsequent pilot days run on LiveKit only, Vapi assistant disabled in dashboard but config retained. |
| LiveKit matches or beats Vapi on **three of four** | **Full cutover at Phase A** with the weak dimension flagged for daily monitoring in §6 of Day-0 log. |
| LiveKit is worse on **two or more** of the four dimensions | **Stay A/B for full pilot.** Every scheduled call runs on both stacks in parallel; daily 21:00 review picks the winning transcript per row before the caregiver recap (§4 of Day-0 runbook). |
| Any AC1-AC9 fails and cannot be fixed by end of Day 1 | **No cutover.** Continue Vapi-only for Day 2. Re-attempt LiveKit cutover next morning with a fresh Day-1 runbook session. |
| `GUARDRAIL_VIOLATION` or `HALLUCINATION` observed on LiveKit during Step 12 or Step 15 | **No cutover for the remainder of the pilot.** LiveKit work continues post-pilot. Vapi remains the production path. |

Cutover decision is logged as a single line at the bottom of §6 of the Day-0 failure-mode log, prefixed `CUTOVER_DECISION:` so the Day-10 synthesis can find it without ambiguity.

---

## 7. Shutdown checklist (end of Day 1 session)

- [ ] Stop the agent process (Ctrl+C in Step 7 terminal)
- [ ] Stop the browser server (Step 9 terminal)
- [ ] Leave admin UI running if you want to watch overnight; otherwise stop it
- [ ] Commit `voiceagent/livekit/.env.example` updates (never `.env`)
- [ ] Append the cutover decision line to Day-0 failure log
- [ ] WhatsApp self-note: "Day 1 LiveKit cutover: [PASS/FAIL/PARTIAL] — decision: [LIVEKIT_ONLY / AB_CONTINUE / VAPI_ONLY]"

End of runbook.
