# Phase 5 — Live Go-Live Checklist (Shubh-only steps)

**Date:** 2026-06-15
**Status:** Awaiting Shubh execution
**Predecessors:** All Phase 1-4 artifacts built. See `2026-06-15-livekit-migration-plan.md` §9 acceptance criteria.

---

## Why this doc exists

Phase 5 (Live Wiring + Test) requires Shubh in front of his computer with browser tabs open. Assistant cannot click "Sign up" on cloud.livekit.io for you. This doc is the **single ordered list** of what to do, with file paths and acceptance gates between each step.

For each step, the deep walkthrough lives in `livekit-provisioning-and-twilio-sip.md` (Parts A-F) and `2026-06-16-livekit-day1-runbook.md`. This doc is the TL;DR ordering layer.

---

## 0. Pre-flight (5 min)

| # | Action | Verify |
|---|---|---|
| 0.1 | Confirm artifacts exist: `ls voiceagent/livekit/agent.py voiceagent/admin-panel/app.py voiceagent/browser-test/server.py voiceagent/evals/promptfoo.yaml voiceagent/scaffolds/webhook_v2.gs` | All five paths print, no errors |
| 0.2 | Confirm 3 cred files still present: `ls voiceagent/twilio_credentials.txt voiceagent/sarvam_api_key.txt voiceagent/vapi_api_key.txt` | All three present |
| 0.3 | Decide: am I doing **A/B** (recommended) or **full cutover**? See Phase 6 decisions doc | Answer recorded |
| 0.4 | Decide: am I using **LiveKit Cloud** (recommended) or self-host? See Phase 6 decisions doc | Cloud chosen for migration |

---

## 1. LiveKit Cloud signup (10 min, Shubh-only)

Walkthrough: `livekit-provisioning-and-twilio-sip.md` Part A.

| # | Action | Verify |
|---|---|---|
| 1.1 | Browser → https://cloud.livekit.io → Sign up (use dasshriyans2802@gmail.com or GitHub OAuth) | Logged in |
| 1.2 | Create project named `medicall-pilot`. Region = nearest to India that's available (Singapore or Mumbai if listed; else US-West) | Project shows in dashboard |
| 1.3 | Settings → Keys → "Create new key". Copy `LIVEKIT_URL` (wss://...), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | 3 strings captured |
| 1.4 | `cp voiceagent/livekit/.env.example voiceagent/livekit/.env` then paste the 3 values + `SARVAM_API_KEY` from `voiceagent/sarvam_api_key.txt` | `.env` has real values, no placeholders |

---

## 2. Install local deps (5 min)

| # | Action | Verify |
|---|---|---|
| 2.1 | `cd voiceagent/livekit && pip install -r requirements.txt` | No errors; livekit-agents, livekit-plugins-sarvam, livekit-plugins-silero installed |
| 2.2 | `cd voiceagent/admin-panel && pip install -r requirements.txt` | streamlit installed |
| 2.3 | `cd voiceagent/browser-test && pip install -r requirements.txt` | fastapi, uvicorn, livekit-api installed |
| 2.4 | `npm install -g promptfoo` (if Node installed; skip if no Node — evals can be deferred to Phase B) | `promptfoo --version` prints |
| 2.5 | Install LiveKit CLI per Part B of provisioning doc (Windows: `winget install LiveKit.LK` or scoop) | `lk --version` prints |

---

## 3. Wire Twilio Elastic SIP Trunk to LiveKit (15 min)

Walkthrough: `livekit-provisioning-and-twilio-sip.md` Parts C, D.

| # | Action | Verify |
|---|---|---|
| 3.1 | Twilio Console → Elastic SIP Trunking → Trunks → Create. Name: `livekit-medicall` | Trunk appears in list |
| 3.2 | Trunk → Termination URI: `<project>.sip.livekit.cloud` (substitute your project subdomain) | Saved |
| 3.3 | Trunk → Credential Lists: create one with username `livekit-medicall-outbound`, generate a strong password. Save the password somewhere accessible | Cred list attached |
| 3.4 | Trunk → Origination: skip for pilot (inbound not needed) | — |
| 3.5 | Phone Numbers → Manage → Active numbers → +1 (814) 524 3223 → Voice Configuration → "Configure with: SIP Trunk" → select `livekit-medicall` | Number now routes via SIP trunk |
| 3.6 | Use `lk sip outbound create` per Part D with the JSON template provided; values: trunk name, Twilio termination URI, cred list username/password | `lk sip outbound list` shows the new trunk; copy the `SIP trunk ID` (starts with `ST_...`) |
| 3.7 | Paste `SIP_TRUNK_ID=ST_...` into `voiceagent/livekit/.env` | `.env` complete |

---

## 4. Wire end-of-call webhook (5 min)

| # | Action | Verify |
|---|---|---|
| 4.1 | Open existing Apps Script project bound to `medicall-pilot-log` sheet | Editor opens |
| 4.2 | Add new file or replace existing `Code.gs` contents with `voiceagent/scaffolds/webhook_v2.gs` | Pasted, saved |
| 4.3 | In the sheet, add a new column `stack` to `call_logs` (column after `duration_sec`) and `raw_payload_json` after that | Headers updated |
| 4.4 | Deploy → Manage Deployments → Edit (pencil) → New Version → Deploy. Reuse same `/exec` URL | Deployment confirmed |
| 4.5 | LiveKit Cloud → Webhooks → Add: paste the Apps Script `/exec` URL; events = `room_finished`, `participant_disconnected` | Webhook saved |
| 4.6 | LiveKit dashboard → "Send test event" button on the webhook | A test row appears in Apps Script execution log; possibly an `error_log` row (test payload won't match schema — that's fine; you're verifying connectivity) |

---

## 5. Boot 3 local services (3 terminal tabs, leave running)

| Terminal | Command | Expected output |
|---|---|---|
| T1 — Agent | `cd voiceagent/livekit && python agent.py dev` | "Worker connected to LiveKit, waiting for jobs" |
| T2 — Admin UI | `cd voiceagent/admin-panel && streamlit run app.py` | Opens `http://localhost:8501`; prompt editor visible |
| T3 — Browser client | `cd voiceagent/browser-test && python server.py` | "Uvicorn running on http://localhost:3000" |

If any fails, see Troubleshooting in the corresponding README.

---

## 6. Browser smoke test — chat with agent, no real call (5 min)

| # | Action | Verify |
|---|---|---|
| 6.1 | Open `http://localhost:3000` in Chrome (allow mic permissions) | Page loads, Connect button visible |
| 6.2 | Click Connect → grant mic | Status shows "Connected to room medicall-test-..." |
| 6.3 | Say "Hello" — wait for agent greeting in Hindi | Agent says "Namaste Shubh ji, main MediCall se..." with Sarvam Bulbul voice |
| 6.4 | Reply "Haan le liya" | Agent says "Bahut achha. Apna khayal rakhiyega. Dhanyavaad." then disconnects |
| 6.5 | Check Langfuse dashboard (if configured) — trace should be visible | Trace shows greeting + reply turns with latencies |

**Gate:** if 6.3 fails (no greeting, wrong language, wrong voice), do NOT proceed to Step 7. Debug agent.py first.

---

## 7. Run Promptfoo evals (2 min)

| # | Action | Verify |
|---|---|---|
| 7.1 | `cd voiceagent/evals && promptfoo eval` | Runs scenario1_confirm, scenario2_deny, scenario3_symptom |
| 7.2 | Expect: 3/3 pass | Exit code 0; if any fail, prompt has regressed — fix in admin UI and re-run |
| 7.3 | `promptfoo view` opens local web viewer | Diff vs prior run if any |

---

## 8. First live SIP test call to +918104348262 (5 min)

Walkthrough: `livekit-provisioning-and-twilio-sip.md` Part E.

| # | Action | Verify |
|---|---|---|
| 8.1 | Have your phone in hand. From a 4th terminal: run the Python snippet from Part E (creates SIP participant for room "medicall-test-live-<timestamp>", `sip_call_to=+918104348262`) | Your phone rings within 10s |
| 8.2 | Pick up. Listen for greeting | Hindi greeting, Sarvam voice, your name "Shubh" inserted |
| 8.3 | Reply "Haan le liya" → wait for sign-off → hang up | Call ends cleanly within 30s |
| 8.4 | Check `medicall-pilot-log` sheet → `call_logs` tab | New row appears with `stack=livekit`, `outcome=CONFIRMED`, transcript excerpt populated |
| 8.5 | Check Langfuse trace | Full call trace visible: STT, LLM, TTS spans per turn |

**Gate (acceptance bar — must all pass):**
- [ ] Phone rang from +1 (814) 524 3223 (correct CID)
- [ ] Voice was Sarvam Bulbul (not Azure/default) — judged by ear vs Vapi recording
- [ ] Outcome correctly classified `CONFIRMED`
- [ ] Sheet row appeared with `stack=livekit`
- [ ] Langfuse trace shows STT + LLM + TTS providers

---

## 9. A/B comparison (if doing A/B per Phase 6 decision)

| # | Action |
|---|---|
| 9.1 | Place same prompt's call via Vapi dashboard to same number |
| 9.2 | Compare side-by-side: voice naturalness (better/equal/worse), P95 latency (Langfuse vs Vapi analytics), outcome accuracy, transcript intelligibility |
| 9.3 | Record verdict in `voiceagent/docs/pilot-notes/livekit-vs-vapi-comparison.md` (create file) |
| 9.4 | Apply A/B split for Days 5-9: parents 1-3 → Vapi (trigger via Vapi dashboard), parents 4-5 → LiveKit (trigger via Part E snippet) |

---

## 10. Edit-prompt-and-call regression test (3 min)

| # | Action | Verify |
|---|---|---|
| 10.1 | Open Streamlit admin UI at localhost:8501 | Prompt editor visible |
| 10.2 | Change `first_message` — append " Aap kaise hain?" to the greeting; click Save | Toast: "Saved" |
| 10.3 | Re-run the Part E snippet (call yourself again) | New greeting includes the appended question |
| 10.4 | Revert the change in admin UI, save | Back to original prompt |

This proves the non-tech PM workflow: edit text in browser, next call uses new prompt, zero code touched.

---

## 11. End-of-Phase-5 deliverables

When you've ticked every box above:

- [ ] LiveKit Cloud project live with creds in `.env`
- [ ] Twilio SIP trunk wired
- [ ] Webhook fires Apps Script with LiveKit payload → Sheet row
- [ ] Browser test client works
- [ ] First live SIP call to +918104348262 succeeded
- [ ] Langfuse trace captured
- [ ] Promptfoo 3/3 pass
- [ ] Admin-UI prompt edit took effect on next call
- [ ] A/B comparison verdict written (if A/B chosen)
- [ ] Update SESSION_HANDOFF_v2.md or write v3 with the new state

→ Proceed to Phase 6 (decisions doc) for the locked recommendations.

---

## Failure-mode quick reference

| Symptom | Likely cause | Where to look |
|---|---|---|
| `lk sip outbound create` 401 | Twilio cred list password mismatch | Twilio Trunk → Credential Lists |
| Phone rings but silent audio | Codec mismatch | LiveKit dashboard → SIP logs; force PCMU in trunk config |
| Phone shows "Unknown" CID | Twilio number not associated to trunk | Twilio → Phone Numbers → +1 (814) 524 3223 voice config |
| Webhook fires but no Sheet row | webhook_v2.gs schema mismatch | Apps Script execution log → `error_log` tab |
| Agent connects but no Hindi audio | Sarvam plugin not loaded / wrong language code | `agent.py` logs; check SARVAM_API_KEY |
| Voicemail picked up, classified as human | VAD thresholds too permissive | `voicemail_detector.py` — tighten `greeting_max_silence_s` from 4.0 to 3.0 |
| Promptfoo eval fails on scenario3 (symptom) | Prompt allowed dosage advice — GUARDRAIL VIOLATION | Roll prompt back immediately; do NOT make live calls |
| Langfuse trace missing | LANGFUSE_PUBLIC_KEY not set in `.env` | Add the key; restart agent.py |

---

*End of Phase 5 checklist. Once §11 deliverables are ticked, the LiveKit migration is operationally complete and pilot Days 5-9 can run on either stack per Phase 6 decisions.*
