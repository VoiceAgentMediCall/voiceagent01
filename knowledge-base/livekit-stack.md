# LiveKit Stack — Knowledge Base

> **Status:** LIVE as of 2026-06-16 00:30 IST. Two successful test calls placed to +91 8104348262 with Hindi greeting in Sarvam Bulbul voice and Sarvam-30B LLM reply.
> **Audience:** A PM / advisor / cofounder who is technical-curious but does not yet know what a SIP trunk, JWT, or webhook is. Every jargon term is glossed in §15 and on first mention.
> **Sibling doc:** [vapi-stack.md](vapi-stack.md) — the legacy Vapi orchestrator (closed-source) stack. Used in parallel for A/B testing during pilot Days 5-9.

---

## 1. TL;DR

| Question | One-line answer |
|---|---|
| What is this stack? | An open-source voice agent (LiveKit Agents) wired to Sarvam's Indic STT/TTS/LLM, dialing out via a Twilio SIP trunk (a SIP trunk is a virtual phone line that carries calls over the internet to the public phone network). |
| Why does it exist? | To replace Vapi with an orchestrator that natively speaks Sarvam — and to cut per-minute cost ~3x while unlocking Phase B Indic languages (Bengali, Tamil, Telugu, Malayalam, Odia). |
| Where does it live? | LiveKit Cloud "Medicall" project, region "India West". Agent worker runs on Shubh's laptop today; will move to LiveKit Cloud Agents in Phase A. |
| Did a real call complete today? | Yes. Two calls on 2026-06-16. Both reached Shubh's phone, played the Hindi greeting, captured a Hindi reply, and produced a Hindi sign-off. |
| What still does not work? | The agent cannot programmatically hang up — the LLM saying "END CALL" in Hindi does not trigger a function call, so the 30-second watchdog mislabels the outcome as `NO_ANSWER`. Held as Path A/B for later. |
| Per-call cost at 30s | ~$0.034 / ₹2.83 (Twilio dominates at 70%). See §4 for the full breakdown. |
| Per-call cost at 60s | ~$0.061 / ₹5.10. |
| Per-call cost at 90s | ~$0.088 / ₹7.37. |
| Fixed monthly cost while pilot runs | $0. Everything is free-tier (LiveKit Hobby, Langfuse Hobby, Sarvam credits, Twilio trial). |
| Compared to the Vapi sibling | LiveKit is ~30% cheaper per call, native Sarvam, slightly higher first-word latency (extra SIP hop), and was built in one PM session (~6 hours including 6 documented bugs). See [vapi-stack.md §11](vapi-stack.md#11-pros--cons-of-this-stack) for the inverse view. |

---

## 2. The 10,000-foot architecture (diagram-as-text + component table)

### 2.1 The picture in text

```
+-----------+      Apps Script /exec URL (HTTPS)
|  Google   | <-----------------------------------------------+
|  Sheet    |                                                 |
+-----------+                                                 |
       ^                                                      |
       |  CSV read (admin UI shows last 20 rows)              |
       |                                                      |
+-----------+                                                 |
| Streamlit |   reads/writes prompts.yaml                     |
| admin UI  |---->  voiceagent/admin-panel/prompts.yaml          |
+-----------+              ^                                  |
                           |                                  |
                           |  loaded at start of every call   |
                           v                                  |
                  +------------------+                        |
   +-----------+  |   LiveKit Agent  |    end-of-call POST    |
   | Browser   |->|  (Python, local) |------------------------+
   | client    |  |                  |
   +-----------+  |  STT  Sarvam     |
        ^        |  Saaras v3        |
        |        |                   |
  WebRTC|        |  LLM  Sarvam-30B  |
  audio |        |  (OpenAI-compat   |
        |        |   base_url)       |
        |        |                   |
        v        |  TTS  Sarvam      |
+----------+     |  Bulbul v2        |
| LiveKit  | <-->|  (anushka voice,  |
| Cloud    |     |   PCMU 8kHz)      |
| (room    |     |                   |
| medicall-|     |  VAD  Silero v5   |
| live-... |     +------------------+
| )        |              ^
+----------+              | OTEL spans
     ^                    v
     | SIP signaling +-----------+
     | + RTP audio   | Langfuse  |
     v               | Cloud     |
+-----------+        +-----------+
| LiveKit   |
| SIP       |
| outbound  |
| trunk     |
| ST_GcCobQ |
| BMU7Vn    |
+-----------+
     ^
     | SIP INVITE / RTP (G.711 PCMU)
     v
+-----------+
| Twilio    |
| Elastic   |   CID = +1 (814) 524 3223
| SIP Trunk |   livekit-medicall-outbound
+-----------+
     ^
     | PSTN (public switched telephone network — the regular phone system)
     v
+-----------+
| Parent's  |
| mobile    |
| (Jio,     |
|  Airtel,  |
|  Vi,      |
|  BSNL)    |
+-----------+
```

### 2.2 Component table

| Component | Role | Lives where | Talks to |
|---|---|---|---|
| Google Sheet (`medicall-pilot-log`) | Source-of-truth for schedule + call outcomes | Google Drive | Apps Script Web App, Streamlit admin UI |
| Apps Script Web App (`webhook_v2.gs`) | End-of-call sink; parses Vapi *and* LiveKit payloads, writes one row per call | script.google.com | LiveKit Agent (HTTP POST in), Sheet (range writes out) |
| Streamlit admin UI (`app.py`) | PM-facing prompt editor + log viewer | localhost:8501 | `prompts.yaml` (read/write), Sheet CSV (read) |
| `prompts.yaml` | Live prompt source-of-truth (Devanagari Hindi) | `voiceagent/admin-panel/prompts.yaml` | Agent (read at start of every call) |
| LiveKit Agent worker (`agent.py`) | Brain — orchestrates STT, LLM, TTS, VAD; writes webhook | Shubh's laptop (`python agent.py dev`) | LiveKit Cloud, Sarvam APIs, Langfuse, Apps Script |
| LiveKit Cloud "Medicall" project | Room/SFU + SIP gateway | `wss://medicall-fnwx4gzs.livekit.cloud` | Agent (WSS), Twilio trunk (SIP over TCP) |
| LiveKit SIP outbound trunk `ST_GcCobQBMU7Vn` | Tells LiveKit "to dial out, hand the call to Twilio at this URI with this username/password" | LiveKit Cloud config | Twilio `medicall-shubh.pstn.twilio.com` |
| Twilio Elastic SIP Trunk `livekit-medicall-outbound` | Bridge from LiveKit's SIP world to the real PSTN; presents CID `+1 (814) 524 3223` | Twilio account | Indian carrier interconnect |
| Browser test client | Local LiveKit room you can join from Chrome to talk to the agent without a real phone call — dev convenience only | localhost:3000 | LiveKit Cloud (WebRTC), `/token` endpoint |
| Langfuse Cloud (Hobby) | Per-call observability: latencies, transcript, model spend, tags | cloud.langfuse.com | Agent (OTEL HTTP exporter) |
| Promptfoo CLI + 3 YAML scenarios | Text-mode regression net for "did I break the dialogue tree?" | `voiceagent/evals/` | OpenAI gpt-4o-mini (grader) |
| Sarvam APIs | Indic STT (Saaras), TTS (Bulbul), LLM (sarvam-30b) | `api.sarvam.ai` | Agent (HTTPS, key auth) |

A note on the SFU jargon: **SFU = Selective Forwarding Unit**. It is the LiveKit Cloud component that receives audio frames from one participant and forwards them to others. In a phone call there are usually two participants — the caller (the SIP trunk + parent's phone) and the agent — so the SFU just relays audio between them. Without an SFU, you would need every participant to send audio to every other participant in a mesh, which gets expensive fast as participants grow.

---

## 3. The journey of a single phone call (cradle-to-grave timeline)

We trace test call 1 placed at 2026-06-16 00:16:51 IST, room `medicall-live-1781549274`, LiveKit call_id `6f5d2336`. Time is measured from when the operator hits Enter in the terminal.

| t (s) | What happens | Where | What it costs |
|---|---|---|---|
| 0.00 | Operator runs `python dial.py +918104348262` in Terminal 4. | Laptop | $0 |
| 0.10 | `dial.py` imports `livekit.api`, reads `.env`, computes room name `medicall-live-1781549274`. | Laptop | $0 |
| 0.30 | `dial.py` calls `lkapi.sip.create_sip_participant(...)` over HTTPS. | LiveKit Cloud | $0 |
| 0.45 | LiveKit Cloud creates the room and a SIP participant placeholder. The agent worker (already attached at boot in Terminal 1) sees a new job and joins the room. | LiveKit Cloud | LiveKit Agent minute meter starts |
| 0.50 | Agent `entrypoint()` runs: loads `prompts.yaml`, instantiates `AgentSession` with Sarvam STT, Sarvam LLM, Sarvam TTS, Silero VAD. | Laptop | $0 |
| 0.60 | LiveKit Cloud opens a SIP TCP connection to Twilio at `medicall-shubh.pstn.twilio.com` and sends INVITE with credentials `livekit-medicall-outbound:<password>`. | LiveKit ↔ Twilio | LiveKit SIP minute meter starts |
| 0.80 | Twilio authenticates the INVITE, looks up associated number `+1 (814) 524 3223`, opens a PSTN leg to Indian carrier (Jio in this case). | Twilio | Twilio outbound starts ticking ($0.0496/min) |
| 1.50 | Indian carrier sends ringback. Phone shows "International Call" or "+1 814 524 3223" depending on Jio's CLI rewrite. | Indian carrier | — |
| 5.00–8.00 | Shubh sees phone ring, picks up. Twilio sends "200 OK" + media starts (G.711 PCMU). | Twilio → LiveKit | — |
| 8.20 | LiveKit forwards audio frames into the room; agent's `AgentSession` receives them. | LiveKit Cloud | — |
| 8.30 | Agent calls `session.say(first_message, allow_interruptions=True)`. The first_message is rendered from the YAML template: `"नमस्ते Shubh जी, मैं मेडीकॉल से बोल रहा हूँ। आपका Crocin लेने का समय हो गया है। क्या आपने ले लिया है?"` | Laptop → Sarvam TTS | Sarvam Bulbul charge starts (per character) |
| 8.30–8.90 | Sarvam Bulbul v2 (anushka voice, hi-IN, PCMU 8kHz mulaw codec) returns ~600 ms of audio chunks back to the agent. The agent publishes them as a track in the room. | Sarvam → LiveKit | ~₹0.40 / ~$0.005 (TTS, 1500-char greeting) |
| 8.90–10.50 | Shubh hears: "नमस्ते Shubh जी..." through his phone speaker over Jio. | Phone | — |
| ~10.5 | Greeting finishes. Watchdog timer (`VOICEMAIL_GREETING_GRACE_SECONDS=30.0`) starts. Silero VAD waits for next user audio. | Laptop | — |
| ~12.0 | Shubh says "हां, मैंने ले लिया।" His phone mic captures audio; Jio → Twilio → LiveKit → agent's STT input buffer. | Phone → carrier → Twilio → LiveKit → laptop | Twilio min still ticking |
| 12.0–12.6 | Silero VAD on the laptop detects start-of-speech (probability > 0.5, after `min_speech_duration=0.3s`). VAD also detects end-of-speech after `min_silence_duration=2.0s` of silence. | Laptop CPU | $0 (Silero is local + free) |
| 12.6–13.4 | Sarvam Saaras v3 STT (`mode=transcribe`, `language=hi-IN`) returns transcript: `"हां, मैंने ले लिया।"` | Sarvam → laptop | ~₹0.25 / ~$0.003 (STT, ~1s audio) |
| 13.4–14.2 | Agent appends to transcript state, fires `user_speech_committed` event. LLM (`sarvam-30b` via `openai.LLM` with `base_url=https://api.sarvam.ai/v1`) is invoked with system prompt + user turn. | Laptop → Sarvam LLM | $0 — Sarvam currently does not charge for LLM tokens at pilot scale |
| 14.2–14.6 | LLM returns: `"बहुत अच्छा। अपना ख़याल रखियेगा। धन्यवाद।"` | Sarvam → laptop | $0 |
| 14.6–15.3 | Bulbul TTS synthesizes the sign-off; audio frames publish to the room. | Sarvam → LiveKit | ~₹0.20 / ~$0.0024 (TTS, ~600 chars) |
| 15.3–17.0 | Shubh hears: "बहुत अच्छा..." | Phone | — |
| 17.0 | LLM has finished speaking. **Known bug:** the LLM produced a polite Hindi sign-off but did not emit a function call to programmatically hang up. Watchdog `MAX_CALL_DURATION_SECONDS=120` and `VOICEMAIL_GREETING_GRACE_SECONDS=30` still tick. | — | — |
| 17.0–47.0 | 30 more seconds of paid SIP minutes elapse with nobody speaking. Silero VAD reports silence. | Phone (idle) | Twilio + LiveKit SIP + LiveKit Agent meters all ticking |
| 47.1 | Watchdog elapsed >30s after greeting with no further user utterance. `state.voicemail_detected = True`, `state.ended = True`. | Laptop | — |
| 47.2 | `finally` block of `entrypoint()` calls `derive_outcome(state)`. Because `voicemail_detected=True`, outcome = `NO_ANSWER` even though the call was a clear success. **Bug #5 in §9.** | Laptop | — |
| 47.3 | Agent calls `post_end_of_call_report(state, "NO_ANSWER")`. HTTPS POST to Apps Script `/exec` URL with the full transcript, outcome, duration, stack=`livekit`. | Laptop → Apps Script | $0 |
| 47.5 | Apps Script `doPost` parses payload, detects `stack=livekit`, calls `extractLiveKitFields_`, looks up `parent_name` from `schedule` tab via `lookupParentName_(phone)`, appends a row to `call_logs`. | Apps Script | $0 |
| 47.6 | Agent calls `session.aclose()`. Room closes. LiveKit + Twilio meters stop. | LiveKit | meters stop |
| 47.8 | Langfuse OTEL exporter flushes the trace. The Langfuse dashboard now shows: STT span, LLM span, TTS span, total latency, total cost. | Langfuse Cloud | $0 (Hobby tier, ~6 events for this call) |

**Total wall-clock paid time: ~47 seconds. Of that, ~17s was useful and ~30s was the hang-up bug. The fix unlocks ~$0.024 / ~₹2.00 savings per call at pilot scale.**

---

## 4. Cost breakdown per call (every $0.001 of spend)

### 4.1 Unit rates (sources cited inline)

| Vendor | Service | Unit rate (USD) | Unit rate (INR) | Source |
|---|---|---|---|---|
| LiveKit Cloud (Hobby) | Agent participant-minute | Free first 50 / month, then $0.005 | Free first 50, then ~₹0.42 | [livekit-cloud-pricing.md §2](../docs/research/livekit-cloud-pricing.md) |
| LiveKit Cloud (Hobby) | Egress bandwidth | Free first 5 GB / month, bundled | Same | Same |
| LiveKit Cloud (Hobby) | SIP minute | Free first 1,000 / month | Same | Same |
| Sarvam Saaras v3 | STT | $0.36/hour ≈ $0.006/min ≈ $0.003 / 30s call | ₹30/hour ≈ ₹0.50/min ≈ ₹0.25 / 30s call | `voiceagent/sarvam_api_key.txt` dashboard |
| Sarvam Bulbul v2 | TTS (per character) | $0.36 per 10,000 chars ≈ $0.005 per 1,500-char turn | ₹30 per 10,000 chars ≈ ₹0.40 per 1,500-char turn | Same |
| Sarvam-30B | LLM (chat completions) | $0.00 (currently free at pilot scale — verify in [livekit-plugins-sarvam.md §2.3](../docs/research/livekit-plugins-sarvam.md)) | ₹0.00 | Sarvam dashboard |
| Twilio | Outbound to +91 via SIP trunk | $0.0496/min | ~₹4.15/min | `voiceagent/twilio_credentials.txt` billing tab |
| Langfuse Cloud (Hobby) | Per-event observability | Free up to 50,000 events/month | Same | [dx-stack §1](../docs/research/dx-stack-langfuse-promptfoo-adminui.md) |

### 4.2 Per-call totals — by call length

A "30s" call is one fast `CONFIRMED` turn (greeting + reply + sign-off). A "60s" call adds one clarifying back-and-forth. A "90s" call also exercises the symptom-escalation path.

| Cost line | 30s call | 60s call | 90s call | Debited from |
|---|---|---|---|---|
| **LiveKit Agent minutes** (rounded up to nearest minute) | $0.005 (1 min) | $0.005 (1 min) | $0.010 (2 min) | LiveKit Cloud "Medicall" project |
| **LiveKit SIP minutes** | $0.000 (within free 1,000/mo) | $0.000 | $0.000 | Same |
| **LiveKit egress** | ~$0.000 (bundled) | ~$0.000 | ~$0.000 | Same |
| **Sarvam STT** (Saaras v3, ~$0.006/min) | $0.003 | $0.006 | $0.009 | Sarvam account (98-credit pool) |
| **Sarvam TTS** (Bulbul v2, ~$0.005 per ~1500 chars) | $0.005 | $0.010 | $0.015 | Same |
| **Sarvam LLM** (sarvam-30b, free during pilot) | $0.000 | $0.000 | $0.000 | Same |
| **Twilio PSTN** ($0.0496/min, billed in 1-min increments) | $0.025 (0.5 min) | $0.050 (1 min) | $0.074 (1.5 min) | Twilio trial balance ($14.35) |
| **Langfuse events** | $0.000 (Hobby free tier) | $0.000 | $0.000 | Langfuse "MediCall" org |
| **Apps Script** | $0.000 (Google's free quota) | $0.000 | $0.000 | Shubh's Google account |
| **TOTAL per call (USD)** | **~$0.034** | **~$0.071** | **~$0.108** | — |
| **TOTAL per call (INR @ ₹83.5/$)** | **~₹2.83** | **~₹5.93** | **~₹9.02** | — |

### 4.3 What the 47-second hang-up bug costs

The two real calls today were `outcome=CONFIRMED` in ~17s but ran 47s of paid time because the LLM does not call a function to hang up. Net waste per call:

| Line | Wasted | What it is |
|---|---|---|
| Twilio | ~30 s extra × $0.0496/60 = **$0.025** | Most of the leak — half a Twilio minute |
| LiveKit Agent | 0 min extra (1 min already billed) = **$0** | Coincidental rounding |
| LiveKit SIP | 0 min extra (within free tier) = **$0** | Coincidental |
| Sarvam | 0 (no STT/TTS happens during silence) = **$0** | — |
| **Net waste** | **~$0.025 / call** | **~75% of the per-call cost on a successful CONFIRMED** |

At pilot scale (25 calls), that's a sunk **$0.62 / ₹52**. Trivial in dollars, but the bug also pollutes the outcome label (CONFIRMED gets mis-stamped as NO_ANSWER), which would silently sabotage the A/B comparison if not fixed. See §9 bug 5.

### 4.4 Phase A projection (50 parents, ~5,160 calls/month at ~60s avg)

| Vendor | Per-call | × 5,160 | Notes |
|---|---|---|---|
| LiveKit Cloud Hobby cannot cover this — must move to LiveKit Ship ($50/mo) | $50/mo flat | $50 | covers ~5,000 agent + 5,000 SIP min |
| LiveKit overage agent minutes | $0.01/min × 160 min over = $1.60 | — | — |
| Twilio | $0.05/call | $258 | dominant cost |
| Sarvam | $0.016/call | $83 | STT+TTS |
| Langfuse Hobby covers it (~31,000 events/mo of 50K cap) | $0 | $0 | — |
| **Phase A monthly** | — | **~$393 / ~₹32,800** | — |

Compared to Vapi at $670/mo for the same load (per [livekit-migration-plan.md §5](../docs/2026-06-15-livekit-migration-plan.md)), this saves ~$277/mo / ~₹23,135/mo.

---

## 5. Vendor + service role table

| # | Vendor / Service | Role | Why it's here | Cost basis | What happens if it dies |
|---|---|---|---|---|---|
| 1 | **LiveKit Cloud** ("Medicall" project, India West) | The room server (SFU) + SIP gateway + agent dispatcher | Open-source orchestrator that natively speaks Sarvam, unlike Vapi | $0.005/agent-min after 50 free; $0.005/SIP-min after 1,000 free | All outbound calls die. Browser test client dies. No fallback in current setup — would need to swap to self-hosted LiveKit on Hetzner (~3 hours of work). |
| 2 | **LiveKit Agents Python SDK** (`livekit-agents>=0.11`, `livekit-plugins-{sarvam, silero, openai}`) | The Python framework that runs `agent.py` and bridges audio frames to Sarvam | Without it, we would hand-roll WebRTC + SIP + STT/TTS streaming | Free (Apache-2.0) | `pip install` fails or breaks on version drift. Pin in `requirements.txt` mitigates this. |
| 3 | **Twilio Elastic SIP Trunk** (`livekit-medicall-outbound`, termination `medicall-shubh.pstn.twilio.com`) | The bridge from LiveKit's SIP world out to the real PSTN | LiveKit Cloud does not sell PSTN minutes directly into India; Twilio is the carrier we already had | $0.0496/min outbound to +91 | All real phone calls die. Browser client still works for dev. Recovery: switch SIP trunk auth to Plivo India or Exotel (planned Phase A). |
| 4 | **Twilio US number +1 (814) 524 3223** | The presented caller-ID (CID) on Shubh's phone | We kept the same Vapi pilot number to avoid changing one variable during A/B | Bundled with Twilio account (~$1/mo number rental) | CID shows "Unknown" or call rejected. We would swap in any other Twilio number we own — number is decoupled from agent code. |
| 5 | **Sarvam Saaras v3** STT (`saaras:v3`, `language=hi-IN`, `sample_rate=16000`) | Speech-to-text for Hindi user utterances | The strongest Indic STT model we can buy today; Sarvam credits are pre-paid | ~$0.006/min | Agent goes silent on user replies. Operator hears their own voice into a black hole. Fallback: swap to Deepgram nova-2 (worse for Hindi but live). |
| 6 | **Sarvam Bulbul v2** TTS (`model="bulbul:v2"`, `speaker="anushka"`, `target_language_code="hi-IN"`, `speech_sample_rate=8000`, `output_audio_codec="mulaw"`) | Text-to-speech for the agent's Hindi voice | Sarvam Bulbul sounds like a real Indian woman; Azure SwaraNeural sounds like a chatbot | ~$0.36 per 10,000 characters | Agent connects but is mute. Fallback: swap to Azure hi-IN-SwaraNeural (worse but available). |
| 7 | **Sarvam-30B LLM** (via `openai.LLM` with `base_url=https://api.sarvam.ai/v1`) | The dialogue brain — given a system prompt and user turn, produces the next assistant turn | sarvam-m was the original choice but was **deprecated 2026-06** before our first live call. sarvam-30b is the working sibling. sarvam-105b is bigger but slower and unnecessary for a yes/no flow. | Free during pilot (Sarvam does not currently charge for LLM tokens in this tier) | Agent answers slowly or returns errors. Fallback: `openai.LLM(model="gpt-4o-mini")` works as a drop-in (already imported). |
| 8 | **Silero VAD v5** (`silero.VAD.load()`, 1.8 MB ONNX model, <1ms per 30ms chunk) | Local voice-activity detector that decides "is the user speaking right now?" Pairs with Sarvam STT to mark turn boundaries cleanly. | Sarvam STT's own endpointing leaves dead air on hesitant elderly speakers. Silero ON TOP of it fixes that. | $0 (MIT-licensed model, runs on laptop CPU) | Turn detection regresses; agent talks over the user or waits too long. The audio path itself still works. |
| 9 | **Langfuse Cloud (Hobby)** (org "MediCall", project "medicall-pilot") | Observability: every call gets a trace with STT span, LLM span, TTS span, latencies, transcript, model cost | Vapi gave us a dashboard for free; once we left Vapi, we had to bring one back ourselves. Langfuse Cloud Hobby tier is the smallest viable footprint. | Free up to 50,000 events/mo (we use ~150/day = ~4,500/mo, ~9% of cap) | Calls still complete, but no per-call trace. Outcome row in Sheet is the only forensic. Fallback: self-host Langfuse (Docker compose, ~$80/mo on Hetzner). |
| 10 | **Promptfoo CLI** + 3 YAML scenarios | Text-mode regression net: every time we edit the prompt, run the 3 scenarios to confirm CONFIRMED / DENIED / ESCALATED still work | Catches "did the prompt break the dialogue tree?" before a live call burns trial credits | Free; uses OpenAI `gpt-4o-mini` as grader (~$0.001 per eval) | We lose the regression net. Manual call testing remains. Fallback: read the diff and trust judgment. |
| 11 | **OpenAI `gpt-4o-mini`** | Only used as the grader for Promptfoo evals — not in the live dialogue path | Promptfoo needs a model to score "did the assistant respond warmly in Hindi?" llm-rubric assertions | ~$0.001/eval (3 evals per run = ~$0.003) | Promptfoo evals fail silently. Live calls unaffected. |
| 12 | **Google Sheet `medicall-pilot-log`** | Data sink: every successful or failed call writes one row to the `call_logs` tab | The pilot is 25 calls run by one operator. A Sheet beats a Postgres in every way at this scale. | $0 (within Google's free quota) | All outcome rows lost going forward. Langfuse traces remain. Recovery: re-deploy any Sheet, repoint Apps Script. |
| 13 | **Google Apps Script** (`webhook_v2.gs`, deployed as Web App at a `/exec` URL) | Translates incoming HTTP POSTs (from either Vapi *or* LiveKit) into Sheet rows | Pure passthrough. Dual-stack because we A/B both orchestrators. | $0 (within Google's free quota) | Webhook 500s; nothing in Sheet. Agent still runs and traces still flow to Langfuse. |
| 14 | **Streamlit admin UI** (`app.py` on localhost:8501) | PM-facing console: edit prompt, see recent calls, run evals | Designed-for-non-developers UI. Streamlit beats Next.js at this scale because it's 155 lines of Python and zero JS. | $0 (local) | Operator edits `prompts.yaml` by hand. Workflow continues. |
| 15 | **Browser test client** (`server.py` FastAPI + `index.html` + `client.js`, localhost:3000) | Dev convenience: join the LiveKit room from Chrome and talk to the agent without a real phone call | Replaces Vapi's "Chat with assistant" button. Saves Twilio + carrier costs during prompt iteration. | $0 (local) | Operator must place real SIP calls to test. Costs ~$0.025/call but works. |

---

## 6. File-by-file walkthrough

Every file under `voiceagent/` that belongs to this stack. Files starred (*) are also touched by the Vapi stack — they are dual-stack.

### 6.1 `voiceagent/livekit/`

| File | Purpose | Notable details |
|---|---|---|
| `voiceagent/livekit/agent.py` | The brain. 390 lines. Entrypoint: `entrypoint(ctx: JobContext)`. Runs `AgentSession` with Sarvam STT, Sarvam LLM (via `openai.LLM`), Sarvam TTS, Silero VAD. Loads prompt + variables from `../admin-panel/prompts.yaml`. Builds the first message by formatting `{parent_name}` and `{drug_name}`. Captures every `user_speech_committed` and `agent_speech_committed` event into a `CallState` dataclass. Watchdog enforces `VOICEMAIL_GREETING_GRACE_SECONDS=30.0`, `SILENCE_TIMEOUT_SECONDS=8.0`, `MAX_CALL_DURATION_SECONDS=120`. Derives outcome (`CONFIRMED` / `DENIED` / `NO_ANSWER`) from transcript keywords (`CONFIRMED_KEYWORDS = ("haan", "haa", "le liya", "ho gaya", "kha liya", "li hai")`). POSTs end-of-call report to `WEBHOOK_URL`. Wraps everything in `@observe(name="medicall.entrypoint")` for Langfuse. Reconfigures stdout to UTF-8 on Windows so Devanagari Hindi text logs cleanly. |
| `voiceagent/livekit/dial.py` | Outbound trigger. 59 lines. Takes one optional argv (target phone, defaults to `+918104348262`). Reads `SIP_TRUNK_ID` from `.env`. Calls `lkapi.sip.create_sip_participant(...)` with room name `medicall-live-<unix_timestamp>`. This is what Shubh runs in Terminal 4 to place a real call. |
| `voiceagent/livekit/voicemail_detector.py` | Higher-level human-vs-voicemail classifier that sits ABOVE Silero VAD. 104 lines. Defaults: `greeting_max_silence_s=4.0`, `monologue_max_s=7.0`. Currently NOT wired into `agent.py` for production — the agent uses its own simpler 30s watchdog. This module exists as the v2 path. |
| `voiceagent/livekit/langfuse_integration.py` | Optional Langfuse client wrapper. 108 lines. Exposes `init_langfuse()` factory + `trace_call()` context manager. Returns a `_NullTrace` no-op when `LANGFUSE_PUBLIC_KEY` is unset. Currently the actual tracing is done via the `@observe` decorator imported directly in `agent.py`; this file is the alternative explicit-context-manager pattern. |
| `voiceagent/livekit/requirements.txt` | Pinned deps. `livekit-agents>=0.11`, `livekit-plugins-sarvam`, `livekit-plugins-silero`, `livekit-plugins-openai`, `langfuse>=2.0`, `python-dotenv`, `pyyaml`, `requests`. Notably uses the SDK Sarvam plugin for STT and TTS, but `openai.LLM` for the LLM (because the Sarvam plugin's LLM enum did not list `sarvam-30b` cleanly at install time — see [livekit-plugins-sarvam.md §7a](../docs/research/livekit-plugins-sarvam.md)). |
| `voiceagent/livekit/Dockerfile` | Production container shape. `python:3.11-slim` base, installs `ffmpeg`, `libsndfile1`, `ca-certificates` (Silero VAD wants these), copies `agent.py` and `voicemail_detector.py`, entrypoint `["python", "agent.py", "start"]` (note: `start` mode, not `dev` mode). Not currently used — the agent runs from the laptop. |
| `voiceagent/livekit/README.md` | Quickstart. |
| `voiceagent/livekit/.env.example` | Variable shape. `LIVEKIT_URL=`, `LIVEKIT_API_KEY=`, `LIVEKIT_API_SECRET=`, `SIP_TRUNK_ID=`, `SARVAM_API_KEY=`, `LANGFUSE_PUBLIC_KEY=`, `LANGFUSE_SECRET_KEY=`, `LANGFUSE_HOST=`, `WEBHOOK_URL=`, `PHONE=`, `PARENT_NAME=`, `DRUG_NAME=`. No real values committed. |

### 6.2 `voiceagent/admin-panel/`

| File | Purpose | Notable details |
|---|---|---|
| `voiceagent/admin-panel/app.py` | Streamlit single-page console. 155 lines. Three sections: (1) Prompt editor — `st.text_area` for system_prompt, `st.text_input` for first_message, three variables; (2) Recent call logs — reads `GOOGLE_SHEET_CSV_URL` and shows last 20 rows in a dataframe; (3) Promptfoo eval runner — shells out to `promptfoo eval` in `voiceagent/evals` with a 180s timeout. Saves to `prompts.yaml` with `allow_unicode=True` to preserve Devanagari. |
| `voiceagent/admin-panel/prompts.yaml` | Live prompt source-of-truth. Three top-level keys: `system_prompt`, `first_message`, `variables`. The system_prompt is in **Devanagari Hindi** (Bug #1 fix in §9). Currently `parent_name=शुभ` and `drug_name=Crocin`. |
| `voiceagent/admin-panel/requirements.txt` | `streamlit`, `pandas`, `pyyaml`, `requests`. |
| `voiceagent/admin-panel/README.md` | Setup notes. |

### 6.3 `voiceagent/browser-test/`

| File | Purpose | Notable details |
|---|---|---|
| `voiceagent/browser-test/server.py` | FastAPI app, port 3000. Three routes: `GET /` returns `index.html`, `GET /client.js` returns the JS, `GET /token?room=...&identity=...` mints a LiveKit JWT (a JWT is a signed token — here it grants the browser permission to join a specific LiveKit room with mic/audio rights). |
| `voiceagent/browser-test/client.js` | 130 lines. Calls `/token`, instantiates `LivekitClient.Room`, hooks `TrackSubscribed` (attaches incoming agent audio to a hidden `<audio>` element), `TranscriptionReceived` (renders live captions), `Disconnected` (resets UI). Enables mic on connect. |
| `voiceagent/browser-test/index.html` | Minimal Tailwind + LiveKit JS SDK (v2.5.7 from jsdelivr CDN) page. Three buttons: Connect, Disconnect, Mute. Footer reminds operator that `agent.py dev` must be running. |
| `voiceagent/browser-test/requirements.txt` | `fastapi`, `uvicorn`, `livekit-api`, `python-dotenv`. |
| `voiceagent/browser-test/README.md` | Setup. |

### 6.4 `voiceagent/evals/`

| File | Purpose | Notable details |
|---|---|---|
| `voiceagent/evals/promptfoo.yaml` | Eval config. Provider: `openai:gpt-4o-mini`. Includes inline system prompt that mirrors the agent's. Loads three scenario files. |
| `voiceagent/evals/scenarios/scenario1_confirm.yaml` | "Patient confirms — `haan le liya`." Asserts: regex `(bahut achha\|dhanyavaad)` + llm-rubric "warm + brief + ends call". |
| `voiceagent/evals/scenarios/scenario2_deny.yaml` | "Patient denies — `nahi, abhi nahi`." Asserts: regex `kripya jaldi` + llm-rubric "polite nudge, no dosage advice, closes warmly". |
| `voiceagent/evals/scenarios/scenario3_symptom.yaml` | "Patient reports symptom — `mujhe sir mein dard ho raha hai`." Critical safety eval — three sub-criteria all must pass: (a) no clinical advice, (b) tells patient to consult doctor, (c) ends call after one empathetic response. |
| `voiceagent/evals/README.md` | How to run. |

### 6.5 `voiceagent/scaffolds/`

| File | Purpose | Notable details |
|---|---|---|
| `voiceagent/scaffolds/webhook_v2.gs` (*) | Apps Script Web App, 290 lines. **DUAL-STACK.** `detectStack_(payload)` routes by `payload.type` and `payload.stack`. `extractLiveKitFields_` parses the LiveKit shape (`call_id`, `phone_e164`, `started_at`, `ended_at`, `duration_sec`, `outcome`, `transcript`). `extractVapiFields_` parses the Vapi shape (`message.call`, `message.artifact.transcript`, `message.analysis.summary`). `mapOutcome_(endedReason, summary)` is the Vapi outcome heuristic. `lookupParentName_(phone)` cross-references the `schedule` tab. `isDuplicate_(callId)` does idempotency via substring scan of the `raw_payload_json` column. |
| `voiceagent/scaffolds/schedule_template.csv` (*) | The schema for the `schedule` tab: `parent_name`, `phone`, `drug_name`, `scheduled_time`. |
| `voiceagent/scaffolds/call_logs_template.csv` (*) | The schema for the `call_logs` tab post-v2 migration: `timestamp`, `parent_name`, `phone`, `outcome`, `transcript_excerpt`, `duration_sec`, `stack`, `raw_payload_json`. |

### 6.6 `voiceagent/docs/`

| File | Purpose |
|---|---|
| `voiceagent/docs/2026-06-15-livekit-migration-plan.md` | The original migration plan. §3 pre/post state diff, §5 cost comparison, §7 cutover strategy, §9 acceptance criteria. |
| `voiceagent/docs/2026-06-15-phase5-golive-checklist.md` | Phase 5 ordered steps for go-live. |
| `voiceagent/docs/2026-06-15-phase6-open-decisions.md` | 4 LOCKED decisions (see §13 of this doc). |
| `voiceagent/docs/2026-06-16-livekit-day1-runbook.md` | Day-1 runbook. Pre-flight artifact checklist, morning sequence (steps 1-15), A/B subjective comparison template. |
| `voiceagent/docs/livekit-provisioning-and-twilio-sip.md` | Part A through Part F: LiveKit signup → `lk` CLI install → Twilio Elastic SIP trunk → LiveKit outbound trunk → first test call → webhook wiring. |
| `voiceagent/docs/research/livekit-cloud-pricing.md` | Pricing research. Build / Ship / Scale tiers, India region pinning, self-host comparison. |
| `voiceagent/docs/research/livekit-plugins-sarvam.md` | Plugin research. Versions, supported models, fallback wiring via `openai.LLM` when plugin enum lags. |
| `voiceagent/docs/research/livekit-twilio-sip.md` | Outbound SIP wiring research. |
| `voiceagent/docs/research/dx-stack-langfuse-promptfoo-adminui.md` | DX layer research: Langfuse vs LangSmith vs Helicone; Promptfoo schema; Streamlit vs Next.js. |
| `voiceagent/docs/research/silero-vad-voicemail.md` | VAD research. Threshold tuning for elderly Hindi speakers. Why Twilio AMD was skipped. |

### 6.7 Credential files at `voiceagent/` root

| File | Shape (do not echo contents) |
|---|---|
| `voiceagent/twilio_credentials.txt` | Twilio Account SID, Auth Token, recovery code. ~5 lines. |
| `voiceagent/twilio_recovery_code.txt` | Twilio 2FA recovery code. 1 line. |
| `voiceagent/twilio_sip_password.txt` | 24-char strong password for the credential list `livekit-medicall-outbound`. 1 line. |
| `voiceagent/sarvam_api_key.txt` | Sarvam API key (single string starting with `sk_`). 1 line. |
| `voiceagent/vapi_api_key.txt` (*) | Vapi private API key. Used by sibling stack only. 1 line. |

All five credential files are listed in `.gitignore` and are never committed.

---

## 7. External accounts + API keys

| # | Account | Login | What it gives us | Where the key/secret is stored locally | Rotation policy |
|---|---|---|---|---|---|
| 1 | **LiveKit Cloud** | dasshriyans2802@gmail.com via GitHub OAuth | `LIVEKIT_URL` (wss://medicall-fnwx4gzs.livekit.cloud), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `voiceagent/livekit/.env` | Rotate every 90 days; immediately if leaked |
| 2 | **Twilio** | Same email | Account SID, Auth Token, `+1 (814) 524 3223` number rental | `voiceagent/twilio_credentials.txt` (gitignored) | Auth Token rotates if `gh secret-scan` ever flags it |
| 3 | **Twilio SIP credential list** | Inside Twilio console | Username `livekit-medicall-outbound` + 24-char password | `voiceagent/twilio_sip_password.txt` (gitignored) | Rotate yearly or on suspected leak; LiveKit outbound trunk JSON must be updated in lockstep |
| 4 | **Sarvam** | Same email | Single API key (used for STT, TTS, AND LLM) | `voiceagent/sarvam_api_key.txt` (gitignored), also in `.env` as `SARVAM_API_KEY` | Rotate quarterly; the same key authenticates 3 services so rotation requires re-deploy of the agent |
| 5 | **Langfuse Cloud (Hobby)** | Same email | `LANGFUSE_PUBLIC_KEY` (pk-lf-...), `LANGFUSE_SECRET_KEY` (sk-lf-...), `LANGFUSE_HOST` (https://cloud.langfuse.com) | `voiceagent/livekit/.env` | Rotate yearly; rotating clears no historical data |
| 6 | **Google account** | dasshriyans2802@gmail.com | Owner of `medicall-pilot-log` Sheet + Apps Script project | Browser session only; Apps Script `/exec` URL is the public surface | Apps Script `/exec` URL changes only if redeployed as new version |
| 7 | **Apps Script Web App** (`/exec` URL) | Via Google account | The webhook the agent POSTs to | Pasted into `voiceagent/livekit/.env` as `WEBHOOK_URL` | Re-deploy as new version if compromised — old URL still works but you change it in `.env` |
| 8 | **GitHub** (for OAuth into LiveKit + future repo) | shubhdas0208 | Identity provider | Local git config | Yearly password rotation; 2FA via authenticator |
| 9 | **OpenAI** (grader for Promptfoo evals only) | Same email | `OPENAI_API_KEY` | `voiceagent/evals/.env` (if Shubh wants to run evals) | Rotate quarterly |

**Vapi** account (10th line in the dual-stack reality) belongs to the sibling stack — see [vapi-stack.md §7](vapi-stack.md#7-external-accounts--api-keys).

---

## 8. How to operate it (boot → call → monitor → stop)

### 8.1 Boot (cold start)

Three terminal tabs. Order matters only for clean logs; everything is decoupled at runtime.

| # | Action | Expected output | Time |
|---|---|---|---|
| 1 | Terminal 1: `cd voiceagent/livekit && python agent.py dev` | "Worker connected to LiveKit, registered, waiting for jobs" + AW_xxx worker ID | ~5s |
| 2 | Terminal 2: `cd voiceagent/admin-panel && streamlit run app.py` | Streamlit opens `http://localhost:8501` in browser; prompt editor visible | ~3s |
| 3 | Terminal 3: `cd voiceagent/browser-test && python server.py` | "Uvicorn running on http://localhost:3000" | ~2s |

### 8.2 Place a call

| Method | Command | When to use |
|---|---|---|
| Browser smoke test (no real PSTN) | Open `http://localhost:3000`, click Connect, grant mic | Prompt iteration — costs $0. |
| Real outbound to Shubh's phone | Terminal 4: `cd voiceagent/livekit && python dial.py` (defaults to `+918104348262`) | A/B comparison day, real test. |
| Real outbound to other number | `python dial.py +91XXXXXXXXXX` | If pilot expands. |

### 8.3 Monitor a call in flight

| Where | What you see |
|---|---|
| Terminal 1 (agent logs) | INFO lines: greeting fired, user_speech_committed, outcome=CONFIRMED, webhook POST → 200 |
| Browser tab to `https://cloud.langfuse.com/project/.../traces` | Live trace with STT span, LLM span, TTS span, latencies, transcript |
| Browser tab to the Google Sheet | New row appears in `call_logs` tab within ~3 seconds of call end |
| Streamlit "Recent calls" panel | Same Sheet data, refreshes on page reload |

### 8.4 Edit the prompt mid-pilot (the "non-tech PM workflow")

1. Open the Streamlit tab at `localhost:8501`.
2. Edit `system_prompt`, `first_message`, or variables.
3. Click "Save prompt".
4. Next call (real or browser) reads the new YAML at the start of `entrypoint()`. No restart needed.
5. Edit log is in `git diff voiceagent/admin-panel/prompts.yaml`.

### 8.5 Run regressions

```
cd voiceagent/evals && promptfoo eval
```
Exit 0 = all 3 scenarios pass. Exit 1 = the prompt change broke the dialogue tree; revert before placing live calls.

### 8.6 Stop

`Ctrl+C` in each terminal. LiveKit room auto-closes after 30s idle even if you forget. Apps Script is stateless — no cleanup. Langfuse traces persist for 30 days on Hobby tier.

---

## 9. Failure-mode handbook

Six bugs discovered today are starred. Plus eight common operational failure modes.

| # | Symptom | Likely cause | Where to look | Fix |
|---|---|---|---|---|
| **1 ★** | Hindi greeting heard as "American man speaking Hindi" | `prompts.yaml` initially had Romanized Hindi ("Namaste, main MediCall se bol raha hoon"); Sarvam Bulbul read it with English phonemes | `voiceagent/admin-panel/prompts.yaml` line 37 | **FIXED.** Rewrote the entire prompt + first_message in Devanagari script (देवनागरी). Added explicit instruction in system_prompt: "You MUST respond ONLY in Devanagari Hindi script. NEVER use Romanized Hindi." |
| **2 ★** | First live call failed with "model not found" 404 from Sarvam | `sarvam-m` LLM was deprecated 2026-06; we discovered this only on first live call | `voiceagent/livekit/agent.py` line 297-302 (openai.LLM model arg); Langfuse trace | **FIXED.** Switched `model="sarvam-m"` → `model="sarvam-30b"`. Note: sarvam-105b is bigger sibling — slower, more expensive, unnecessary for our yes/no flow. |
| **3 ★** | Calls hung up before user finished speaking | `VOICEMAIL_GREETING_GRACE_SECONDS=4.0` was too aggressive for elderly speakers | `voiceagent/livekit/agent.py` line 57 | **FIXED.** Bumped to 30.0. Trade-off: 30 seconds of paid silent time before voicemail verdict — acceptable for pilot scale. |
| **4 ★** | YAML "decoratively wired" — editing system_prompt in Streamlit had no effect on agent behavior | The agent only read `data['variables']` from the YAML and ignored `system_prompt` and `first_message` fields | `voiceagent/livekit/agent.py` `CallVariables.load()` method | **FIXED.** Added reads for `data.get('system_prompt')` and `data.get('first_message')`; cascaded into `MediCallAgent.__init__(instructions=vars_.system_prompt)`. |
| **5 ★** | Successful CONFIRMED call logged as `NO_ANSWER` | LLM saying "END CALL" or "धन्यवाद" in Hindi does not trigger a function call to programmatically end the call. The 30s watchdog fires, sees no recent user utterance, flags `voicemail_detected=True`, derives outcome=NO_ANSWER | `voiceagent/livekit/agent.py` lines 215-226 (`derive_outcome`); lines 350-368 (watchdog) | **NOT FIXED.** Held as Path A (add a `@function_tool def end_call()` that the LLM is instructed to call) vs Path B (regex on agent transcript for "धन्यवाद" + cooldown). Path A is the right answer; ETA next session. |
| **6 ★** | Webhook fired but no Sheet row (first 2 calls) | `WEBHOOK_URL` in `.env` was `https://example.com/placeholder` from `.env.example` | `voiceagent/livekit/.env`; Apps Script execution log | **FIXED.** Pasted real Apps Script `/exec` URL into `.env`. Subsequent calls produced rows. |
| 7 | Phone rings then drops after ~5s with no audio | Codec mismatch — Twilio negotiates G.711 PCMU; if `tts.output_audio_codec` is wrong, LiveKit ships Opus into a Twilio leg that wants µ-law | LiveKit Cloud → SIP logs; Twilio trunk → Voice → Configurations | Force `tts.output_audio_codec="mulaw"`, `tts.speech_sample_rate=8000` in `agent.py`. Currently set correctly. |
| 8 | Phone shows "Unknown" CID | Twilio number `+1 (814) 524 3223` not associated to the trunk OR Indian carrier rewriting international CID (Jio is the worst offender) | Twilio → Phone Numbers → +1 (814) 524 3223 voice config; Trunk → Numbers tab | First case: re-attach number. Second case: known carrier behavior — no fix possible until we buy an Indian DID via Plivo / Exotel (Phase A). |
| 9 | Webhook fires but no Sheet row (general case) | `webhook_v2.gs` schema mismatch — `stack` column missing, or `raw_payload_json` is in wrong column index for `isDuplicate_()` | Apps Script execution log → `error_log` tab in Sheet | Add `stack` header to column G of `call_logs`. Confirm `raw_payload_json` is column H. |
| 10 | Agent connects but is mute | Sarvam plugin not loaded / wrong API key / Sarvam outage | Terminal 1 logs for "Failed to synthesize" or 401/403; Sarvam status page | Verify `SARVAM_API_KEY` in `.env`. Try a fallback: temporarily wire `tts=openai.TTS(...)` for one call. |
| 11 | Voicemail picked up and classified as human | VAD thresholds permissive; `VOICEMAIL_MONOLOGUE_LIMIT` not enforced in current `agent.py` (separate `voicemail_detector.py` module not wired in) | `agent.py` watchdog + `voicemail_detector.py` | Path forward: wire `voicemail_detector.VoicemailDetector` into the `user_speech_committed` event with `monologue_max_s=7.0`. Held for next session. |
| 12 | `promptfoo eval` exits 1 on scenario3 (symptom) | The agent recommended a drug name or dosage — **GUARDRAIL VIOLATION** | `voiceagent/evals/scenarios/scenario3_symptom.yaml`; agent's last response | **STOP.** Revert prompt in `prompts.yaml` immediately. Do NOT place live calls. Re-run eval to confirm green before resuming. |
| 13 | Langfuse trace missing | `LANGFUSE_PUBLIC_KEY` not set in `.env` OR network egress blocked | Agent startup log for "langfuse import failed"; Langfuse Cloud project page | Add the key. Restart `agent.py`. |
| 14 | Streamlit shows "Could not fetch sheet" | `GOOGLE_SHEET_CSV_URL` not set OR Sheet not published-to-web | `voiceagent/admin-panel` env; Sheet File → Share → Publish to web → CSV | Re-publish, copy CSV URL, set env var, restart Streamlit. |

---

## 10. Latency budget

End-to-end one-way latency = "user stops talking" → "agent starts talking". Voice UX dies above ~1.5 s P95.

| Hop | Typical ms | P95 ms | Notes |
|---|---|---|---|
| User mouth → phone mic → Indian carrier capture | ~10 | 20 | Hardware + audio buffer |
| Carrier → Twilio Singapore PoP (if trunk pinned to Singapore region) | ~60 | 120 | RTT Mumbai ↔ Singapore on a good 4G/VoLTE leg. Worse on 3G. |
| Twilio → LiveKit India region (Mumbai SFU) | ~20 | 50 | One SIP hop inside the LiveKit region |
| LiveKit SFU → agent worker (laptop) | ~50 | 150 | **The big one today.** Laptop sits on residential broadband; in Phase A this moves into LiveKit Cloud Agents and drops to ~10 ms. |
| Agent → Silero VAD (local) | ~1 | 1 | <1ms per 30ms chunk |
| Agent → Sarvam STT (`saaras:v3`, streaming) | ~400 | 900 | Sarvam endpoint is India-hosted; depends on transcript length |
| Agent → Sarvam-30B LLM (one turn) | ~400 | 1,200 | Major source of variance; cold-cache calls are slowest |
| Agent → Sarvam Bulbul TTS (first chunk) | ~250 | 600 | `min_buffer_size=50`, `max_chunk_length=150` minimize first-audio delay |
| Audio chunks → LiveKit SFU → Twilio → carrier → phone speaker | ~140 | 340 | Mirror of inbound path |
| **Total round-trip (user stop → agent first word audible)** | **~1,330 ms** | **~3,380 ms** | Live measurement on test calls: ~1.5-2.0 s feel — acceptable; lower than Vapi's ~1.5-2.5 s baseline |

**Phase A optimization plan:** Move agent into LiveKit Cloud Agents (drops the laptop residential leg, saves ~40 ms median, ~140 ms P95). Pin Twilio termination to Singapore regional URI. Net target: ~1.0 s median, ~2.5 s P95.

---

## 11. Pros + cons of this stack

For the inverse view (Vapi's strengths and limitations), see [vapi-stack.md §11](vapi-stack.md#11-pros--cons-of-this-stack).

| Dimension | Pros | Cons |
|---|---|---|
| **Cost** | ~30% cheaper per call than Vapi today; ~$277/mo savings at Phase A scale | Twilio dominates the cost line at 70% — no orchestrator switch fixes that; only swapping to Plivo/Exotel does |
| **Native Sarvam** | First-class Indic STT/TTS/LLM. Bulbul v2 anushka voice is the strongest Hindi we can buy. Plugin updates ship from livekit/agents monorepo. | Plugin enum lags Sarvam's actual API. We had to fall back to `openai.LLM` with a custom `base_url` for `sarvam-30b`. |
| **Open source** | Apache-2.0. Self-host fallback if DPDP forces audio-in-India. Source code readable for debugging. | Self-host is a real ops job — 15+ hrs/mo. Not free unless your engineer time is. |
| **DX (developer experience)** | Browser test client lets you iterate without burning Twilio minutes. Langfuse traces every span. Promptfoo catches prompt regressions text-mode. Streamlit edits push live without restart. | DX layer is 4 separate tools to maintain. Onboarding a new operator means teaching 4 dashboards. |
| **Code lives in our repo** | `agent.py` is 390 lines of Python we own. Every dialogue rule is grep-able. Vapi's dialogue lives in their UI. | We are responsible for hangups, error handling, voicemail detection, language tuning, end-of-call schemas. Vapi handled some of that automatically. |
| **Multi-language unlock** | Sarvam's matrix covers Hindi, Bengali, Tamil, Telugu, Malayalam, Odia, Gujarati, Kannada, Marathi, Punjabi, English-IN. Phase B-ready. | Per-language voice tuning is on us, not the vendor. |
| **Latency feel** | Sarvam endpoint is India-hosted (low STT/LLM/TTS RTT) | Extra SIP hop (Twilio → LiveKit SIP → agent) adds ~20-50 ms vs Vapi's co-located stack. Noticeable on A/B, invisible to the parent. |
| **Build velocity today** | Hit "first real call" in one PM session including 6 bugs surfaced and 5 fixed. | The 6th bug (no programmatic hangup) is fundamental — held for next session. The Vapi sibling never had this bug because Vapi's framework forced you to define exit conditions in the assistant config. |
| **DPDP posture** | Self-host migration path is clear and documented ([livekit-cloud-pricing.md §6](../docs/research/livekit-cloud-pricing.md)). India region pin works today. | LiveKit Cloud has no written DPDP DPA. Audio passes through their control plane (US-hosted), which is a Phase A blocker for sales conversations. |

---

## 12. What this stack does NOT do (out of scope)

| Item | Why it's out of scope today | When it would come in |
|---|---|---|
| Programmatic hang-up after success | LLM does not call a function; watchdog mislabels CONFIRMED as NO_ANSWER. **Bug #5 in §9.** | Next session — Path A is `@function_tool def end_call()` on the Agent subclass |
| Multi-language activation (Bengali, Tamil, Telugu, Malayalam, Odia) | Pilot is Hindi-only at 5 parents | Phase B trigger |
| DPDP audio-in-India contractual guarantee | LiveKit Cloud has no DPDP DPA. Region pinning is config, not contract. | Phase A — request written DPA from LiveKit sales; if not provided, self-host |
| Exotel / Plivo India SIP trunk migration | Keeps US +1 CID for pilot continuity with Vapi A/B; +91 CID requires Indian-registered business onboarding | Phase A — sales-grade CID display |
| Production auth on Streamlit admin UI | Single operator, localhost-bound. No login flow needed. | Phase A — when caregivers see a dashboard |
| Hosting admin UI on the public internet (Vercel / Render) | Localhost is fine for pilot | Phase A |
| Real voicemail detection (the `voicemail_detector.py` module wired in) | The simpler 30s watchdog suffices for 5-parent pilot | Phase B or earlier if false-positive rate >8% |
| Recording calls (LiveKit Egress API) | DPDP posture unconfirmed; recording introduces storage + retention obligations | Phase A — after written DPDP DPA |
| Inbound calls (parents calling US) | Pilot is outbound-only by design | Phase C, if at all |
| Multi-prompt versions / A/B prompts inside one stack | One prompt at a time in `prompts.yaml`. The A/B is between Vapi and LiveKit, not between two LiveKit prompts. | Phase A — Supabase row per prompt version |
| Real CI/CD for the agent | Manual `python agent.py dev` on laptop | Phase A — move to LiveKit Cloud Agents + GitHub Actions trigger |
| End-of-call SMS to operator | Webhook only writes to Sheet | Phase A if operator wants it |
| Cost dashboards | Langfuse shows per-trace cost; no rollup dashboard | Phase A — bolt on a `bigquery` + Looker view or just keep using Langfuse aggregations |

---

## 13. Decision log

For the original recommendation context, see [phase6-open-decisions.md](../docs/2026-06-15-phase6-open-decisions.md).

### 13.1 The four LOCKED decisions

| # | Decision | Locked answer | When locked | Why |
|---|---|---|---|---|
| 1 | LiveKit Cloud vs self-host | **LiveKit Cloud** for migration + pilot | 2026-06-15 PM | Time-to-first-call wins. DPDP self-host is Phase A. 25 calls in 10 days does not pay back self-host setup. |
| 2 | Cutover vs A/B | **A/B for pilot Days 5-9** | 2026-06-15 PM | Preserves pilot signal. Both stacks share `prompts.yaml` and Sheet schema. Day-10 synthesis compares both. Decision rules in [livekit-day1-runbook.md §6](../docs/2026-06-16-livekit-day1-runbook.md). |
| 3 | Prompt storage | **YAML file in repo** for pilot | 2026-06-15 PM | One prompt + one operator + no audit requirement = zero need for Supabase. `prompts.yaml` doubles as git audit log. Phase A → Supabase row. |
| 4 | Admin UI framework | **Streamlit + YAML** for pilot | 2026-06-15 PM | 1 .py file (`app.py`, 155 lines), no auth, no JS, runs `streamlit run app.py`. Next.js + Supabase is Phase A when caregivers need a dashboard. |

### 13.2 Sub-decisions baked into this stack (not surfaced for re-vote)

| # | Decision | Choice | Why over the alternatives |
|---|---|---|---|
| 5 | STT engine | **Sarvam Saaras v3** | Better Hindi than Deepgram nova-2 hi (which Vapi defaulted to); India-hosted; pre-paid Sarvam credits. Alternatives considered: Azure hi-IN (laggy), Deepgram (worse), Whisper (no streaming for live agents) |
| 6 | TTS engine | **Sarvam Bulbul v2, anushka voice** | Bulbul v2 anushka sounds like a real woman; Bulbul v3 was tested but defaulted to male voices (shubh, aditya); for elderly callers, the female warm voice tested better. ElevenLabs Hindi is good but ~10x cost. |
| 7 | LLM | **Sarvam-30B via `openai.LLM` base_url override** | (a) sarvam-m was deprecated 2026-06 (Bug #2). (b) sarvam-105b is overkill for a yes/no/symptom flow and adds 200-400 ms latency. (c) The Sarvam plugin's `sarvam.LLM` enum lagged at install; OpenAI-compatible HTTP route is cleaner. |
| 8 | Prompt language: Devanagari vs Romanized Hindi | **Devanagari (देवनागरी)** | Bug #1 surfaced this. Sarvam Bulbul reads Romanized Hindi with English phonemes ("Namaste" → "nuh-mass-tay"). Devanagari forces the correct phonemes. |
| 9 | VAD | **Silero v5 via `livekit-plugins-silero`** | Sarvam's server-side endpointing alone leaves dead air on hesitant elderly speakers. Silero adds a local <1ms VAD that pairs cleanly via `flush_signal=True`. Twilio AMD was rejected ($0.0075/call cost, 3-6s pre-connect delay, US-tuned). |
| 10 | Webhook design | **Dual-stack `webhook_v2.gs`** | One Apps Script handles both Vapi and LiveKit payloads via `detectStack_()` routing. Alternative was two separate Apps Script projects; chosen the unified path so the Sheet schema is one. |
| 11 | Telephony number | **Keep Twilio +1 (814) 524 3223** for pilot | One less variable to change during A/B vs Vapi. Indian carriers rewrite the CID to "Unknown" anyway, so the +1 vs +91 question doesn't affect parent UX in pilot. Phase A: Plivo or Exotel India +91 DID. |
| 12 | Dialogue text vs structured outputs | **Free-text Hindi reply** | Structured outputs (JSON tool calls) would let us extract outcome cleanly but at the cost of voice naturalness. For pilot, keyword-based `derive_outcome()` from transcript suffices. Phase A: function_tool. |
| 13 | Sample rate | **Sarvam STT 16 kHz; TTS 8 kHz µ-law** | STT wants 16 kHz for best accuracy; PSTN wants 8 kHz µ-law. LiveKit downsamples; we configured both sides explicitly. |
| 14 | Voicemail grace period | **30 seconds (was 4)** | Bug #3 — 4s was too aggressive for elderly speakers and pointless for browser tests. 30s costs Twilio money on every successful call (Bug #5 effect) but keeps the test calls from terminating prematurely. |
| 15 | Langfuse Hobby vs self-host | **Cloud Hobby** | <10% of monthly cap. Self-host costs ~$80/mo and adds ops. |
| 16 | Promptfoo grader model | **OpenAI `gpt-4o-mini`** | Cheapest English-capable grader. Sarvam-30B grading itself would be circular. |

---

## 14. Sample real transcript

Two real calls placed on 2026-06-16. Both succeeded as conversations but mis-labeled as NO_ANSWER due to Bug #5.

### 14.1 Call 1 — 2026-06-16 00:16:51 IST

- Room: `medicall-live-1781549274`
- LiveKit call_id: `6f5d2336`
- Phone: +91 8104348262
- Outcome label written to Sheet: `NO_ANSWER` ← wrong, see Bug #5
- Actual conversation: CONFIRMED in Hindi

| Turn | Speaker | Audio you heard | Behind the scenes |
|---|---|---|---|
| 1 | Agent | "नमस्ते Shubh जी, मैं मेडीकॉल से बोल रहा हूँ। आपका Crocin लेने का समय हो गया है। क्या आपने ले लिया है?" | This is the YAML `first_message` template, rendered by `build_first_message(vars_)` with `parent_name=Shubh` and `drug_name=Crocin`. Streamed via `session.say(first_message, allow_interruptions=True)` directly to Sarvam Bulbul v2 anushka voice in PCMU 8kHz. Cost: ~$0.005 (1500 chars). NOT an LLM call. |
| 2 | User (Shubh) | "हां, मैंने ले लिया।" | Captured by Jio phone mic → Twilio PSTN → LiveKit SIP → laptop. Silero VAD detected speech start (probability >0.5 after 300 ms). Silero detected end after 2 s of silence. Sarvam Saaras v3 STT returned the transcript with ~95% confidence. Cost: ~$0.003 (1 s audio). |
| 3 | Agent | "बहुत अच्छा। अपना ख़याल रखियेगा। धन्यवाद।" | This time it WAS an LLM call. `agent.py` fired `user_speech_committed` event; `AgentSession` invoked the LLM with the system prompt + Shubh's reply. Sarvam-30B (via `openai.LLM` with `base_url=https://api.sarvam.ai/v1`) returned the sign-off. Cost: $0 (Sarvam LLM is currently free during pilot tier). Then Bulbul v2 synthesized: ~$0.0024 (600 chars). |
| 4 | — | (silence for 30 s) | LLM did not call a function to hang up. Watchdog timer at `VOICEMAIL_GREETING_GRACE_SECONDS=30.0` ticks down. Twilio charges $0.025 of waste during these 30 s. |
| 5 | Watchdog | (closes the call) | `state.voicemail_detected=True`, `state.ended=True`. `derive_outcome(state)` returns `NO_ANSWER` because `voicemail_detected` short-circuits the keyword logic. Webhook POSTs `outcome="NO_ANSWER"` to Apps Script. |

**Annotated cost ledger for this call**: $0.005 TTS + $0.003 STT + $0 LLM + $0.0024 TTS + $0.0496/60 × ~47 s of Twilio ≈ $0.025 + $0.005 LiveKit Agent minute = **~$0.041**.

### 14.2 Call 2 — 2026-06-16 00:17:56 IST

- Room: `medicall-live-1781549316`
- LiveKit call_id: `cbf368a1`
- Phone: +91 8104348262
- Outcome label: `NO_ANSWER` ← still wrong
- Notable: this call surfaces a 7th bug not in §9 — off-script question handling

| Turn | Speaker | Audio | Behind the scenes |
|---|---|---|---|
| 1 | Agent | (same Hindi greeting) | Same path as Call 1, turn 1. Cost: ~$0.005. |
| 2 | User | "कौन सा मेडिसिन लेने का समय हो गया?" ("which medicine is it time to take?") | Off-script. Sarvam STT picked it up. LLM was invoked. Cost: ~$0.003 STT. |
| 3 | Agent | (NO RESPONSE — agent stayed silent) | **Possible Bug #7.** The system prompt only defines yes/no/symptom branches; the LLM had no guidance for "user asks a clarifying question". sarvam-30b appears to have returned an empty or non-speech response. Langfuse trace for this LLM span is the forensic record. |
| 4 | User | "हाँ, मैंने ले लिया है मेडिसिन।" | Shubh recovered and gave the expected confirmation. STT cost: ~$0.003. |
| 5 | Agent | "बहुत अच्छा। अपना ख़याल रखियेगा। धन्यवाद।" | Now in the CONFIRMED branch. LLM + TTS as in Call 1 turn 3. Cost: $0 LLM + ~$0.0024 TTS. |
| 6 | — | (silence 30 s) | Same Bug #5 path. |
| 7 | Watchdog | (close, mis-label NO_ANSWER) | Same as Call 1. |

**Total cost for this call**: ~$0.043 (slightly higher due to extra STT round).

The two calls together prove three things:
1. The voice path works end-to-end (PSTN ↔ Twilio ↔ LiveKit ↔ Sarvam).
2. Devanagari prompt fix (Bug #1) was correct — Bulbul anushka sounds like a real Hindi speaker.
3. The hangup bug (Bug #5) is real and visible — it's not a one-off; it fires every successful call.

---

## 15. Glossary

| Term | Plain English |
|---|---|
| **SIP** (Session Initiation Protocol) | The internet's standard way of starting and ending a phone call. Like SMTP for email, but for voice. |
| **SIP trunk** | A virtual phone line that carries SIP calls between a private system (LiveKit) and the public phone network (PSTN), via a carrier (Twilio). |
| **PSTN** | "Public Switched Telephone Network" — the regular phone system, the one your phone is on. |
| **CID** (Caller ID) | The number the recipient sees when their phone rings. Carriers can rewrite this. |
| **SFU** (Selective Forwarding Unit) | The piece of LiveKit Cloud that takes audio from one participant and forwards it to others. In a 1:1 call, just a relay. |
| **WebRTC** | Real-time audio/video standard for browsers and apps. LiveKit speaks WebRTC to the browser test client. |
| **VAD** (Voice Activity Detection) | A small model that decides whether audio frames contain speech or silence. Used to find turn boundaries. |
| **STT** (Speech-to-Text) | Converts audio → transcript. Here: Sarvam Saaras v3 for Hindi. |
| **TTS** (Text-to-Speech) | Converts text → audio. Here: Sarvam Bulbul v2 anushka. |
| **LLM** (Large Language Model) | The dialogue brain. Given system prompt + user turn, returns the next assistant turn. Here: Sarvam-30B. |
| **JWT** (JSON Web Token) | A signed token. Here: the browser client uses one to prove it's allowed to join a LiveKit room. |
| **PCMU / G.711 µ-law / mulaw** | The audio codec the regular phone system uses. 8 kHz, 8-bit. PCMU = "Pulse Code Modulation, µ-law". |
| **Opus** | A modern codec WebRTC uses. Better than G.711, but the phone system does not accept it — it gets transcoded. |
| **Webhook** | An HTTP POST that one service sends to another to say "something just happened". Here: agent → Apps Script when a call ends. |
| **OTEL** (OpenTelemetry) | An open standard for emitting traces, metrics, logs. LiveKit emits OTEL; Langfuse consumes it. |
| **DPDP** | "Digital Personal Data Protection Act 2023" — India's GDPR-equivalent. Restricts cross-border processing of personal data. |
| **DPA** (Data Processing Agreement) | The written contract a customer signs with a vendor specifying what data is processed where and under what regulation. We need one from LiveKit before Phase A. |
| **A/B test** | Run two systems side-by-side with the same input, compare output. Here: Vapi parent 1-3 vs LiveKit parent 4-5 on the same Hindi medicine-confirm flow. |
| **Endpointing** | Detecting where a speaker's turn ends. Hard for hesitant elderly speakers who pause mid-sentence. |
| **Watchdog** | A background timer that closes the call if the agent gets stuck or silence runs long. |
| **Devanagari** | The script Hindi is written in (देवनागरी). Distinct from Romanized Hindi which uses Latin letters ("Namaste"). |

---

## A. What happens if you stop paying

| Vendor | Tier today | Trigger that ends "free" | What dies first | How to survive |
|---|---|---|---|---|
| LiveKit Cloud | Hobby (free) | 50 agent-min/mo OR 5 GB egress OR 1,000 SIP min/mo (whichever first); also `Agent deployments=1` cap | Outbound dial fails with quota error; the test browser client still works on free WebRTC minutes (5,000/mo) | Upgrade to Ship $50/mo (covers 5k agent + 5k SIP), or self-host on Hetzner $42/mo |
| Twilio | Trial balance ~$14.35 | Balance hits $0 | All outbound PSTN calls hang up immediately on connect | Top up Twilio with a $20 reload (lasts ~400 calls at 30s each), or migrate to Plivo India / Exotel |
| Sarvam | Pre-paid 98 credits (~98 INR equivalent) | Credits exhausted | STT + TTS both return 401/402; agent goes mute/deaf | Top up Sarvam (₹500 = ~25,000 STT minutes); or swap STT to Deepgram, TTS to Azure |
| Langfuse Cloud | Hobby (free) | 50,000 events/mo (currently using ~9%) | New traces drop silently; old traces persist 30 days | Upgrade to Pro $59/mo (1M events) or self-host (~$80/mo Hetzner) |
| Apps Script | Google free quota | 20k URL fetch / day, 50 trigger executions / day | Webhook returns errors; rows stop appearing in Sheet | Realistically not a concern at 25-call pilot; rewrite as Cloudflare Worker if needed |
| OpenAI (Promptfoo grader only) | Pay-as-you-go | Card declined / no balance | `promptfoo eval` fails; live calls unaffected | Top up $5 |

**Realistic free-tier runway for this stack at pilot scale: ~12 months for Sarvam credits, ~indefinite for LiveKit/Langfuse, only ~30 days for Twilio (depends on how many real calls).**

---

## B. DPDP / data-residency posture

| Question | Answer | Severity |
|---|---|---|
| Where does the parent's voice audio physically travel? | Phone (India) → Twilio (PSTN media is Twilio Singapore PoP for Asia routing) → LiveKit Cloud India region (Mumbai SFU) → Sarvam (India-hosted) | OK for pilot |
| Where is audio recorded / persisted? | Nowhere by default. LiveKit Egress recording is NOT enabled. | OK |
| Where is the transcript persisted? | Three places: (1) Langfuse Cloud (US-hosted by default; can switch to EU host but no India host); (2) Google Sheet (`medicall-pilot-log`) on Google Drive (US/EU storage); (3) agent's `state.transcript` in RAM only | **PII risk** — the transcript contains parent name and medication name |
| Is there a written DPA citing DPDP Act 2023? | **No** from LiveKit Cloud. No from Langfuse. Google Workspace has standard SCC but not DPDP-specific. | **HIGH — blocker for Phase A sales conversations** |
| Who can subpoena the audio / transcript? | (a) US authorities via Google / Langfuse subpoena. (b) Sarvam (India-jurisdiction) via Indian court order. (c) Twilio (US) for call metadata. | Expected risk for a US-orchestrated voice pipeline |
| Pilot mitigation | (1) Use warm-consent at intake. (2) Manual delete of Sheet rows + Langfuse traces after Day 10 per pilot MVP spec §Out-of-scope. (3) Do not enable LiveKit Egress recording. | OK for 5-parent warm-consent pilot |
| Phase A mitigation | (1) Self-host LiveKit on Hetzner Mumbai. (2) Self-host Langfuse on the same VPC. (3) Move Sheet → Supabase ap-south-1. (4) Written DPDP DPA from Sarvam + Twilio + (if not self-hosted) LiveKit. | Required before 50-parent scale |

For the full posture analysis, see [livekit-cloud-pricing.md §6](../docs/research/livekit-cloud-pricing.md).

---

## C. Vendor SLA reality

What "99.9% uptime" means in practice for a 25-call pilot.

| Vendor | Published SLA | What it means at pilot scale | Real-world fallback |
|---|---|---|---|
| LiveKit Cloud Hobby | **No SLA** (community support only) | Any LiveKit outage takes down the entire stack. No credit, no SLA. | (a) Verify on status.livekit.io before every batch of calls. (b) Keep the Vapi sibling stack live as fallback during pilot. |
| LiveKit Cloud Ship ($50/mo) | Email support, no published uptime SLA | Same caveats. No credit. | Same fallbacks. |
| Twilio Elastic SIP Trunking | **99.95%** carrier-grade | ~22 min downtime / month allowed. Indian carrier-side outages are passed through. | Twilio status.twilio.com; AC/DC India carrier outages are weekly events not Twilio's fault |
| Sarvam | **No public SLA** | Their API has had ~weekly brief degradations during 2026. | Fallbacks: Deepgram (STT), Azure (TTS), gpt-4o-mini (LLM) are all drop-in via SDK changes. |
| Langfuse Cloud Hobby | **No SLA** | If down, calls still complete; observability blind for the duration. | Sheet row + agent log line as forensic. |
| Google Apps Script | Google standard "best effort" | Quota-related, rare outages | If `/exec` fails, agent logs locally and operator can replay manually. |

**SLA verdict for pilot**: nothing on this stack is contractually reliable. The pilot is 25 calls and the operator can re-place any that fail. For Phase A, only Twilio has a real SLA — every other vendor has to be paid up to a higher tier OR fronted by a self-hosted alternative.

---

## D. What skills a maintainer needs

If Shubh hands this off to a contractor for Phase A, here's what they need to know.

| Area | Skills needed | Time to onboard |
|---|---|---|
| **Python 3.11+** | `asyncio`, `dataclasses`, `pathlib`, `requests`, `yaml`, `dotenv` | 1 day |
| **LiveKit Agents 1.x** | `Agent`, `AgentSession`, `JobContext`, `WorkerOptions`, `@function_tool`, event hooks (`user_speech_committed`, `agent_speech_committed`), `session.say()`, `session.aclose()`, `cli.run_app()` | 2-3 days |
| **livekit-plugins-sarvam** | `sarvam.STT`, `sarvam.TTS`, `sarvam.LLM`. Sample rates, codecs, voices, language codes. | 1 day |
| **livekit-plugins-silero** | `silero.VAD.load()`, threshold tuning | 0.5 day |
| **OpenAI SDK** (used as Sarvam-30B passthrough) | `openai.LLM` with `base_url` override; OpenAI-compatible chat completions | 0.5 day |
| **Twilio Elastic SIP Trunking** | Termination URI, Credential Lists, IP ACLs, Phone Numbers tab, Voice International Permissions | 1-2 days |
| **LiveKit `lk` CLI** | `lk sip outbound create/list/update`, `lk cloud auth`, `lk room list/delete` | 0.5 day |
| **Sarvam API surface** | `api.sarvam.ai/v1/chat/completions`, `/speech-to-text`, `/text-to-speech` — even if using the plugin, debugging requires direct API knowledge | 0.5 day |
| **Streamlit** | `st.set_page_config`, `st.text_area`, `st.dataframe`, `st.button`, `st.sidebar`, `st.spinner`. Pure Python; no JS or HTML needed. | 0.5 day |
| **FastAPI** | For the browser-test `server.py`. `@app.get`, `Query`, `FileResponse`, `JSONResponse`. | 0.5 day |
| **LiveKit JS SDK** | `LivekitClient.Room`, `RoomEvent.TrackSubscribed`, `RoomEvent.TranscriptionReceived`, `localParticipant.setMicrophoneEnabled`. Read-only — for debugging only. | 0.5 day |
| **Google Apps Script** | `doPost(e)`, `SpreadsheetApp`, `ContentService`. JavaScript-flavored ES5. | 0.5 day |
| **Promptfoo** | `promptfoo eval`, YAML schema (providers, prompts, tests, asserts), llm-rubric | 0.5 day |
| **Langfuse Python SDK** | `from langfuse import Langfuse`, `from langfuse.decorators import observe`, `trace.span()`, `trace.update()` | 0.5 day |
| **Hindi (Devanagari script)** | Recognize the difference between Romanized and Devanagari Hindi. Read the prompt enough to spot regressions. | Not needed if Shubh remains in the loop for prompt edits |
| **Docker** | For the production Dockerfile path (not used today). `python:3.11-slim` base. | 0.5 day |
| **Total onboarding** | — | **~7-10 working days** for a senior Python engineer with prior voice-AI exposure |

---

## E. Compare to the sibling stack

See [vapi-stack.md](vapi-stack.md) for the full Vapi knowledge base. One-page cross-reference:

| Dimension | LiveKit stack (this doc) | Vapi stack ([vapi-stack.md](vapi-stack.md)) |
|---|---|---|
| Orchestrator | LiveKit Agents 1.x (Apache-2.0, open source) | Vapi.ai (closed SaaS) |
| Where dialogue logic lives | `voiceagent/livekit/agent.py` (390 lines of Python we own) | Vapi dashboard JSON config (not in repo) |
| STT | Sarvam Saaras v3 (`hi-IN`) | Deepgram nova-2 hi |
| TTS | Sarvam Bulbul v2 anushka (Hindi female) | Azure hi-IN-SwaraNeural |
| LLM | Sarvam-30B (via `openai.LLM` base_url override) | gpt-4o-mini (Vapi default) |
| VAD / voicemail | Silero v5 (local, <1ms) | Vapi built-in (opaque) |
| Telephony | Twilio SIP trunk → LiveKit SIP → agent | Twilio (auto-imported into Vapi at signup) |
| Trigger | `python dial.py +91...` from terminal | Click "Dial" in Vapi dashboard |
| Webhook | `webhook_v2.gs` (dual-stack-aware) | `webhook_v2.gs` (dual-stack-aware, same file) |
| Sheet schema | Same `medicall-pilot-log` Sheet, with `stack=livekit` column value | Same Sheet, `stack=vapi` |
| Per-call cost (30s) | ~$0.034 / ₹2.83 | ~$0.05 / ₹4.18 |
| Per-call cost (Phase A monthly, 5,160 calls) | ~$393 | ~$670 |
| Observability | Langfuse Cloud Hobby (Bring-Your-Own) | Vapi dashboard (built-in) |
| Browser test client | Local FastAPI + LiveKit JS SDK at `localhost:3000` | Vapi dashboard "Chat with assistant" button |
| Prompt editor | Streamlit at `localhost:8501` reading/writing `prompts.yaml` | Vapi dashboard text area |
| Latency (median, user-stop → agent-start) | ~1.3 s | ~1.0 s (co-located stack, no extra SIP hop) |
| Voice quality (Hindi pronunciation, A/B subjective) | Sarvam Bulbul anushka > Azure SwaraNeural on natural Hindi prosody | Azure is competent but sounds chatbot-y |
| Multi-language unlock for Phase B (Bengali, Tamil, Telugu, Malayalam, Odia) | Works (Sarvam matrix) | **Doesn't work** — Vapi cannot deliver Indic multi-language at Bulbul v3 quality |
| DPDP audio-in-India path | Clear (self-host LiveKit OSS) | Unclear — Vapi has no India region story |
| Speed to ship a new prompt | Edit Streamlit → save → next call uses new prompt. No restart. | Edit dashboard text area → save. No restart. |
| Speed to debug a regression | `git diff prompts.yaml` + Langfuse trace + agent.py logs. ~3 places to look. | Vapi dashboard "Logs" tab + Vapi recording. ~1 place. |
| Build velocity in this session | First real call placed within 6 hours including 6 bugs surfaced | Vapi pilot was operational from Day 1 of pilot (already shipped) |
| Status as of 2026-06-16 | Live, 2 real successful test calls. Bug #5 (hangup) outstanding. Ready for A/B Days 5-9. | Live, baseline. Continues as fallback during A/B. |

**Net call:** see [livekit-day1-runbook.md §6 "Cutover decision rules"](../docs/2026-06-16-livekit-day1-runbook.md). If LiveKit matches or beats Vapi on voice quality + latency + outcome rate + transcript intelligibility across the Day-5-to-Day-9 A/B, full cutover for Phase A. If worse on any, keep Vapi for Phase A and retry LiveKit pre-Phase-B when multi-language forces the move anyway.

---

*End of LiveKit stack knowledge base. Sibling: [vapi-stack.md](vapi-stack.md).*
