# MediCall — LiveKit Agent

Hindi medication-reminder voice agent. Ports the Vapi pilot prompt to LiveKit Agents 1.x with the Sarvam plugin (Saaras STT + Bulbul TTS + Sarvam-M LLM).

## Install

```bash
cd voiceagent/livekit
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
```

Python 3.11+ recommended. Silero VAD downloads its model on first run.

## Configure

```bash
cp .env.example .env
# Fill: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SARVAM_API_KEY, WEBHOOK_URL
```

`PARENT_NAME` / `DRUG_NAME` are fallbacks. The agent prefers `../admin-panel/prompts.yaml` if present:

```yaml
variables:
  parent_name: "Sharma"
  drug_name: "Metformin"
  phone: "+919999999999"
```

## Run dev

```bash
python agent.py dev
```

Opens a hot-reload worker. Use [LiveKit Playground](https://agents-playground.livekit.io/) to dial in.

## Run production worker

```bash
python agent.py start
# or
docker build -t medicall-livekit .
docker run --env-file .env medicall-livekit
```

## Trigger an outbound call

See `../docs/2026-06-15-livekit-migration-plan.md` and the SIP runbook at `../docs/livekit-provisioning-and-twilio-sip.md` (Twilio Elastic SIP trunk → LiveKit SIP → room → this agent worker).

## End-of-call payload

POST to `WEBHOOK_URL`:

```json
{
  "type": "end-of-call-report",
  "call_id": "uuid",
  "started_at": 1718000000.0,
  "ended_at": 1718000045.7,
  "duration_seconds": 45.7,
  "transcript": [{"role": "agent", "text": "...", "t": 0.0}],
  "outcome": "CONFIRMED",
  "phone": "+91...",
  "parent_name": "Sharma",
  "drug_name": "Metformin",
  "stack": "livekit",
  "voicemail_detected": false
}
```

Outcome heuristics: `haan/le liya/ho gaya/kha liya` → `CONFIRMED`, `nahi/abhi nahi/bhool` → `DENIED`, voicemail or silence >8s → `NO_ANSWER`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `AgentSession` rejects `sarvam.LLM` model id | Plugin enum lacks `sarvam-m` | Already wired via `openai.LLM(base_url="https://api.sarvam.ai/v1")` — confirm `SARVAM_API_KEY` is set |
| Agent speaks English to Hindi caller | TTS `target_language_code` mismatch | Lock to `hi-IN` on both STT and TTS, or read STT-detected language per turn |
| Dead air on hesitant elderly callers | Sarvam server-side VAD too lax | `flush_signal=True` + `high_vad_sensitivity=True` (already set) + Silero VAD |
