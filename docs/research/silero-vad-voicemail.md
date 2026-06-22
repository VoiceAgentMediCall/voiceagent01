# Silero VAD + Voicemail Detection for Hindi Voice Agent

Audience: Python LiveKit agent that calls elderly Hindi users and must hang up on Indian carrier voicemail (Airtel, Jio, Vi, BSNL) without misclassifying slow speakers as machines.

Date: 2026-06-15

---

## 1. Silero VAD — what it is

| Attribute | Value |
|---|---|
| Model | Silero VAD v5 (enterprise-grade neural VAD) |
| License | MIT |
| Size on disk | ~1.8 MB (single ONNX/JIT file) |
| Inference latency | <1 ms per 30 ms audio chunk on a single CPU thread |
| Sample rates | 8 kHz and 16 kHz |
| Languages | 6000+ (language-agnostic; works on Hindi, Hinglish, regional accents) |
| Install | `pip install silero-vad` or via `livekit-plugins-silero` |
| Repo | https://github.com/snakers4/silero-vad |

**Install standalone (only if not using LiveKit plugin):**

```bash
pip install silero-vad
```

**Install via LiveKit plugin (recommended for this project):**

```bash
pip install "livekit-agents[silero]~=1.0"
```

Plugin auto-downloads the weights on first run and caches them in the user's HF/torch cache. No GPU required.

---

## 2. LiveKit integration

Reference: https://docs.livekit.io/agents/build/turns/vad/

The plugin lives at `livekit.plugins.silero.VAD`. You attach it to an `AgentSession` and LiveKit uses it for turn detection (start-of-speech / end-of-speech) before sending audio to STT.

### Minimal Python agent wiring

```python
from livekit.agents import AgentSession
from livekit.plugins import silero, sarvam, openai

session = AgentSession(
    vad=silero.VAD.load(
        min_speech_duration=0.3,      # seconds — see Section 4
        min_silence_duration=2.0,     # seconds — see Section 4
        prefix_padding_duration=0.5,  # audio kept BEFORE speech start
        activation_threshold=0.5,     # 0..1, probability cutoff
        sample_rate=16000,
    ),
    stt=sarvam.STT(language="hi-IN"),
    llm=openai.LLM(model="gpt-4o-mini"),
    tts=sarvam.TTS(speaker="anushka", language="hi-IN"),
)
```

### Parameter reference

| Parameter | Default | What it does | Why it matters for elderly Hindi |
|---|---|---|---|
| `min_speech_duration` | 0.05 s | Audio shorter than this is ignored as noise | Keep small (0.3s) so single-word replies like "haan" / "nahi" register |
| `min_silence_duration` | 0.55 s | Silence required before declaring end-of-turn | Raise to 2.0s — elderly speakers pause mid-sentence |
| `prefix_padding_duration` | 0.5 s | Audio retained before detected speech-start | Captures soft onset of "namaste ji" |
| `activation_threshold` | 0.5 | Probability above which a frame counts as speech | Lower (0.3-0.4) if mic-quality is poor on 2G/3G connections |
| `sample_rate` | 16000 | 8k or 16k | Twilio inbound is 8kHz μ-law; LiveKit upsamples |

`VAD.load()` is called once at process start and the loaded instance is reused per session — do not reload per call.

---

## 3. Indian-carrier voicemail heuristic

Silero VAD only tells you "speech vs no-speech." It does not classify "human vs machine." You layer a heuristic on top using turn-taking and timing signals.

### Signals that strongly indicate voicemail on Airtel / Jio / Vi / BSNL

| Signal | Why it's a tell |
|---|---|
| Long uninterrupted monologue >5s after pickup | Humans pause after "hello?" — voicemail greetings run 8-15s straight |
| No human utterance within 3-4s of agent's greeting | Real users say *something* (haan, hello, kaun) quickly |
| Fixed-length intro pattern repeating across calls to same network | Carrier greetings are recordings; identical waveform fingerprint |
| Recorded-quality audio (slight echo, compressed, fixed prosody) | Hard to detect cheaply; ignore for v1 |
| Beep tone followed by silence | Classic "leave a message after the tone" — strong signal |

### Recommended rule (simple, deterministic)

```
After agent greeting finishes playing:
  start a 4-second timer (HUMAN_RESPONSE_TIMEOUT)
  if VAD reports no speech start within 4s:
      voicemail_detected = True
      hang up with reason = "NO_ANSWER"
  else if continuous speech detected for >7s without a VAD-detected pause:
      voicemail_detected = True
      hang up with reason = "NO_ANSWER"
  else:
      continue normal conversation
```

The 7-second monologue rule is the key tell. Real Hindi speakers — even slow elderly ones — pause for breath within 5-6s. A carrier greeting like *"Aap jis number par call kar rahe hain woh abhi vyast hai. Kripya beep ke baad apna sandesh chhodein"* runs 9-12s flat.

### Implementation sketch

```python
import asyncio
from livekit.agents import Agent, AgentSession, function_tool

VOICEMAIL_INITIAL_TIMEOUT = 4.0   # seconds after agent greeting
VOICEMAIL_MONOLOGUE_LIMIT = 7.0   # seconds of unbroken speech

class CallAgent(Agent):
    def __init__(self):
        super().__init__(instructions="Hindi-speaking receptionist for elderly callers.")
        self._first_speech_seen = False
        self._monologue_started_at: float | None = None
        self._voicemail_detected = False

    async def on_user_started_speaking(self):
        self._first_speech_seen = True
        self._monologue_started_at = asyncio.get_event_loop().time()

    async def on_user_stopped_speaking(self):
        self._monologue_started_at = None

    async def after_greeting(self, session: AgentSession):
        # 4s timer for ANY human reply
        await asyncio.sleep(VOICEMAIL_INITIAL_TIMEOUT)
        if not self._first_speech_seen:
            self._voicemail_detected = True
            await self._hangup(session, reason="NO_ANSWER")
            return

        # Continuous-monologue watchdog
        while session.is_active:
            await asyncio.sleep(0.5)
            if self._monologue_started_at is None:
                continue
            elapsed = asyncio.get_event_loop().time() - self._monologue_started_at
            if elapsed > VOICEMAIL_MONOLOGUE_LIMIT:
                self._voicemail_detected = True
                await self._hangup(session, reason="NO_ANSWER")
                return

    async def _hangup(self, session, reason: str):
        await session.aclose(reason=reason)
```

The `on_user_started_speaking` / `on_user_stopped_speaking` hooks are provided by `livekit.agents.Agent` and fire off VAD state transitions. See https://docs.livekit.io/agents/build/events/.

---

## 4. Tunable thresholds for elderly demographic

Default Silero settings are tuned for crisp adult speech. Elderly Hindi callers have softer onsets, longer mid-sentence pauses, and more code-switching (Hindi-English filler). Start permissive — **over-classify as human**, then tighten with call data.

| Threshold | Default | Pilot setting | Rationale |
|---|---|---|---|
| `activation_threshold` | 0.5 | 0.4 | Catches softer "haan" replies |
| `min_speech_duration` | 0.05 s | 0.3 s | Filters mic-pop noise but keeps single-syllable replies |
| `min_silence_duration` | 0.55 s | 2.0 s | Don't cut off mid-sentence pauses |
| `prefix_padding_duration` | 0.5 s | 0.5 s | Default is fine |
| `HUMAN_RESPONSE_TIMEOUT` | n/a | 4.0 s | First-reply window after agent greeting |
| `VOICEMAIL_MONOLOGUE_LIMIT` | n/a | 7.0 s | Continuous-speech cutoff |

**Tuning loop:**

1. Ship pilot with these values + log every classification (`voicemail_detected`, `monologue_seconds`, `time_to_first_speech`).
2. After 100 calls, label a random 20 by hand (human / voicemail / ambiguous).
3. If false-positive rate on humans >5%, raise `VOICEMAIL_MONOLOGUE_LIMIT` to 9s.
4. If voicemails are getting through, lower `HUMAN_RESPONSE_TIMEOUT` to 3s.

---

## 5. Twilio AMD as alternative (skip for pilot)

Reference: https://www.twilio.com/docs/voice/answering-machine-detection

Twilio offers Answering Machine Detection as a paid add-on. You enable it on the outbound `<Dial>` or REST API call.

| Aspect | Detail |
|---|---|
| Cost | $0.0075 per call (AMD) or $0.0095 (AMD + MessageEnd) on top of voice minutes |
| Setup | Pass `MachineDetection=Enable` or `DetectMessageEnd` in TwiML / REST |
| Latency | 3-6s delay before connection (Twilio listens first) |
| Result | `AnsweredBy` field in status callback |

### `AnsweredBy` values

| Value | Meaning |
|---|---|
| `human` | Live person |
| `machine_start` | Answering machine greeting started |
| `machine_end_beep` | Greeting ended with beep — safe to leave message |
| `machine_end_silence` | Greeting ended with silence |
| `machine_end_other` | Greeting ended without clear marker |
| `fax` | Fax tone detected |
| `unknown` | Couldn't classify in the listen window |

### Why skip for pilot

- **Cost**: at $0.0075/call, 1000 calls/day = $7.50/day = ~$2,700/year just for AMD on top of LiveKit + Twilio minutes.
- **Latency**: the 3-6s pre-connect listen adds noticeable delay; users hear silence then "hello" awkwardly.
- **Coverage gap**: AMD is trained on US/EU carrier greetings; Indian carrier patterns (especially Hindi-language ones) report higher misclassification rates anecdotally — Twilio doesn't publish India-specific accuracy.
- **Config overhead**: status callback URL + `AnsweredBy` parsing + separate hangup logic for `human` vs `machine_*`.
- **Silero + heuristic is free, runs in-process, and is good enough** for the pilot's volume (<500 calls/day).

**Revisit AMD when**: pilot scales past ~2000 calls/day OR voicemail false-positive rate stays >8% after threshold tuning OR you need beep-detection to leave automated voicemails.

---

## 6. Logging NO_ANSWER cleanly

Add `voicemail_detected` and supporting signals to your end-of-call event so analytics can split true no-answers from voicemail hits.

### End-of-call event schema (recommended)

```python
{
  "call_id": "CA_xxxxx",
  "phone_number": "+91XXXXXXXXXX",
  "duration_seconds": 12.4,
  "ended_at": "2026-06-15T10:23:01Z",
  "end_reason": "NO_ANSWER",          # one of: COMPLETED, NO_ANSWER, USER_HANGUP, ERROR
  "voicemail_detected": true,         # NEW: heuristic verdict
  "voicemail_signal": "monologue",    # NEW: "no_initial_speech" | "monologue" | "twilio_amd" | null
  "time_to_first_speech_s": null,     # NEW: null if no speech detected
  "max_monologue_s": 8.2,             # NEW: longest unbroken speech segment
  "turn_count": 0,                    # human-agent exchanges before hangup
}
```

### Emit it in code

```python
from livekit.agents import metrics

@session.on("close")
def _on_close(ev):
    metrics.log_event(
        "call_ended",
        call_id=session.room.name,
        phone_number=session.metadata.get("to_number"),
        duration_seconds=session.duration,
        end_reason=ev.reason,
        voicemail_detected=agent._voicemail_detected,
        voicemail_signal=agent._voicemail_signal,
        time_to_first_speech_s=agent._time_to_first_speech,
        max_monologue_s=agent._max_monologue,
        turn_count=agent._turn_count,
    )
```

### Downstream

- Push event to Supabase / your analytics DB.
- In dashboards, split `NO_ANSWER` by `voicemail_detected`:
  - `true` → call hit voicemail, do not retry for 2 hours.
  - `false` → ringing timeout, retry in 30 minutes.
- Use `max_monologue_s` distribution to validate the 7s threshold isn't cutting humans.

---

## References

- Silero VAD repo and model card: https://github.com/snakers4/silero-vad
- LiveKit VAD docs: https://docs.livekit.io/agents/build/turns/vad/
- LiveKit Silero plugin: https://docs.livekit.io/agents/integrations/silero/
- LiveKit Agents events: https://docs.livekit.io/agents/build/events/
- Twilio AMD: https://www.twilio.com/docs/voice/answering-machine-detection
- Twilio AMD pricing: https://www.twilio.com/en-us/voice/pricing (Answering Machine Detection add-on)
