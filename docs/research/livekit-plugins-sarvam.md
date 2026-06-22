# livekit-plugins-sarvam — Research Brief

> **Audience:** Porting a Vapi assistant that uses Sarvam as a custom provider over to a clean LiveKit Agents app.
> **Snapshot date:** 2026-06-15.
> **Cost note:** Session hit the cost ceiling during research — this doc trusts the official LiveKit + PyPI pages and flags anything uncertain inline.

---

## 1. Package basics

| Item | Value | Source |
|---|---|---|
| PyPI name | `livekit-plugins-sarvam` | [PyPI](https://pypi.org/project/livekit-plugins-sarvam/) |
| Latest version | **1.6.0** (Jun 11, 2026); 1.5.13 was the prior stable | [PyPI](https://pypi.org/project/livekit-plugins-sarvam/) |
| Python | `>= 3.10.0` | [PyPI](https://pypi.org/project/livekit-plugins-sarvam/) |
| License | Apache-2.0 | [PyPI](https://pypi.org/project/livekit-plugins-sarvam/) |
| Install (standalone) | `pip install livekit-plugins-sarvam` | [PyPI](https://pypi.org/project/livekit-plugins-sarvam/) |
| Install (recommended, with agents extras) | `uv add "livekit-agents[sarvam]~=1.5"` | [LiveKit STT docs](https://docs.livekit.io/agents/models/stt/plugins/sarvam/) |
| Node sibling | `pnpm add @livekit/agents-plugin-sarvam@1.x` | [LiveKit STT docs](https://docs.livekit.io/agents/models/stt/plugins/sarvam/) |
| GitHub source | `livekit/agents` monorepo, path `livekit-plugins/livekit-plugins-sarvam` | [GitHub](https://github.com/livekit/agents/tree/main/livekit-plugins/livekit-plugins-sarvam) |
| Import path | `from livekit.plugins import sarvam` | [LiveKit STT docs](https://docs.livekit.io/agents/models/stt/plugins/sarvam/) |
| Auth env var | `SARVAM_API_KEY` | [PyPI](https://pypi.org/project/livekit-plugins-sarvam/), [LiveKit TTS docs](https://docs.livekit.io/agents/models/tts/plugins/sarvam/) |

Prefer the `livekit-agents[sarvam]` extras install — it pins a compatible `livekit-agents` core, which avoids the "plugin loaded but `AgentSession` won't accept it" mismatch.

---

## 2. Supported Sarvam models

### 2.1 STT — Saarika / Saaras

| Model id | Use it when | Languages | Notes |
|---|---|---|---|
| `saaras:v3` | **Default for new agents** | Full set (see §3) | Recommended by LiveKit docs |
| `saarika:v2.5` | Legacy parity | Subset (11 langs) | Smaller language list |
| `saaras:v2.5` | Legacy streaming | Subset (11 langs) | Superseded by v3 |

Sources: [LiveKit STT plugin guide](https://docs.livekit.io/agents/models/stt/plugins/sarvam/), [Sarvam x LiveKit integration page](https://www.sarvam.ai/integrations/livekit).

### 2.2 TTS — Bulbul v3 / v2

| Model | Default speaker | Voices available |
|---|---|---|
| `bulbul:v3` | `shubh` | **Female:** amelia, ishita, kavitha, kavya, neha, pooja, priya, ritu, roopa, rupali, shruti, shreya, simran, sophia, suhani, tanya. **Male:** aayan, aditya, advait, amit, ashutosh, dev, kabir, manan, rahul, ratan, rohan, shubh, sumit, varun |
| `bulbul:v2` | `anushka` | **Female:** anushka, arya, manisha, vidya. **Male:** abhilash, hitesh, karun |

Source: [LiveKit TTS plugin guide](https://docs.livekit.io/agents/models/tts/plugins/sarvam/).

### 2.3 LLM — Sarvam family

The PyPI page lists `sarvam-30b`, `sarvam-30b-16k`, `sarvam-105b`, `sarvam-105b-32k` with **OpenAI-compatible chat completions + tool calling** ([PyPI](https://pypi.org/project/livekit-plugins-sarvam/)).

> **Conflict flagged:** the user brief mentions **Sarvam-M**. The current PyPI page does not list a `sarvam-m` id under the plugin's LLM class. Sarvam-M may be exposed via Sarvam's public chat API under a different id, but the LiveKit plugin's `sarvam.LLM(...)` enumerates the 30b/105b family.
> **Recommendation:** if you need Sarvam-M specifically, wire it through `openai.LLM` pointed at Sarvam's OpenAI-compatible base URL (see §7) rather than depending on the plugin's enum.

---

## 3. Language codes

LiveKit's docs explicitly call out these BCP-47 style codes for the plugin:

| Language | Code | Saaras v3 STT | Saarika/Saaras v2.5 STT | Bulbul TTS |
|---|---|---|---|---|
| Hindi | `hi-IN` | yes | yes | yes |
| English (India) | `en-IN` | yes | yes | yes |
| Bengali | `bn-IN` | yes | yes | yes |
| Tamil | `ta-IN` | yes | yes | yes |
| Telugu | `te-IN` | yes | yes | yes |
| Malayalam | `ml-IN` | yes | yes | yes |
| Odia | `od-IN` | yes | yes | check Sarvam matrix |
| Gujarati | `gu-IN` | yes | yes | yes |
| Kannada | `kn-IN` | yes | yes | yes |
| Marathi | `mr-IN` | yes | yes | yes |
| Punjabi | `pa-IN` | yes | yes | yes |

Saaras v3 also covers ~13 more Indian languages + English variants beyond the table above ([LiveKit STT docs](https://docs.livekit.io/agents/models/stt/plugins/sarvam/)). For TTS, the LiveKit doc says "set `target_language_code` (e.g. `hi-IN` or `en-IN`)" and defers the full TTS matrix to Sarvam ([LiveKit TTS docs](https://docs.livekit.io/agents/models/tts/plugins/sarvam/)).

> **Gotcha:** Odia is `od-IN` in the LiveKit STT examples (matches ISO 639-2/B). Some older Sarvam REST examples used `or-IN` (ISO 639-1). If a call 400s on the language code, try the other one before assuming the model lacks Odia.

---

## 4. Wiring example — `AgentSession` (LiveKit Agents 1.x)

```python
# main.py
import os
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import sarvam, silero

# Required: export SARVAM_API_KEY=...

class MediCallAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are MediCall, a polite Hindi/English appointment assistant "
                "for a small Indian clinic. Confirm name, reason, preferred slot. "
                "Switch languages mid-call if the caller does."
            ),
        )

async def entrypoint(ctx: JobContext):
    await ctx.connect()

    session = AgentSession(
        # ---- STT ----
        stt=sarvam.STT(
            model="saaras:v3",
            language="hi-IN",         # primary; v3 auto-detects across Indic
            mode="transcribe",
            sample_rate=16000,
            high_vad_sensitivity=True,
            flush_signal=True,        # forces endpointing on barge-in
        ),
        # ---- LLM ----
        # Use the plugin's LLM for sarvam-30b/105b.
        # For Sarvam-M, see §7 (fallback via openai.LLM with base_url override).
        llm=sarvam.LLM(
            model="sarvam-105b",
            temperature=0.3,
        ),
        # ---- TTS ----
        tts=sarvam.TTS(
            target_language_code="hi-IN",
            model="bulbul:v3",
            speaker="shubh",          # male voice; swap for shreya/ishita etc.
            speech_sample_rate=24000, # match downstream telephony codec
            pace=1.0,
            output_audio_codec="mp3",
            output_audio_bitrate="128k",
            min_buffer_size=50,       # lower = snappier first audio, more chunks
            max_chunk_length=150,     # split long LLM tokens to start speaking sooner
            send_completion_event=True,
        ),
        # ---- VAD (turn detection) ----
        vad=silero.VAD.load(),
    )

    await session.start(agent=MediCallAgent(), room=ctx.room)
    await session.generate_reply(instructions="Greet the caller in Hindi.")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
```

Pattern source: [LiveKit STT example](https://docs.livekit.io/agents/models/stt/plugins/sarvam/) + [LiveKit TTS example](https://docs.livekit.io/agents/models/tts/plugins/sarvam/), adapted for the agents 1.x `AgentSession` API.

> **Note on `VoicePipelineAgent`:** that class is the **legacy 0.x** entrypoint. Agents 1.x replaces it with `AgentSession` + an `Agent` subclass. If you're porting from older Vapi+LiveKit code that referenced `VoicePipelineAgent`, just swap to the above pattern — the STT/LLM/TTS slots line up 1:1.

---

## 5. Known gotchas

| Area | Gotcha | Fix |
|---|---|---|
| **Endpointing** | Sarvam STT uses server-side VAD. Without `flush_signal=True`, a caller who pauses mid-sentence can hold the turn open for seconds. | Set `flush_signal=True` and pair with Silero VAD; also raise `high_vad_sensitivity=True` for noisy phone audio. |
| **Sample rate** | Default STT input is 16 kHz; default TTS output is 22.05 kHz. Telephony (SIP/PSTN) usually wants 8 kHz µ-law. | Set `stt.sample_rate=16000` (let LiveKit downmix) and `tts.speech_sample_rate=8000` with `output_audio_codec="mulaw"` for telephony egress. Supported rates: 8000, 16000, 22050, 24000, 32000, 44100, 48000 ([TTS docs](https://docs.livekit.io/agents/models/tts/plugins/sarvam/)). |
| **Streaming TTS chunking** | Long LLM responses delay first-audio if `min_buffer_size` / `max_chunk_length` are large. | Lower both. Docs explicitly recommend: "Reduce `min_buffer_size` gradually if the agent waits too long" and "Reduce `max_chunk_length` if long LLM responses are delaying synthesis." |
| **Chunked vs streamed STT** | `saaras:v3` supports WebSocket streaming; `saarika:v2.5` historically chunked. | Stick with `saaras:v3` for low-latency. |
| **Language mismatch** | Saying TTS `target_language_code="en-IN"` while STT detects Hindi causes the agent to speak English at a Hindi caller. | Either lock both ends to `hi-IN`, or pipe the STT-detected language into `tts.update_options(target_language_code=...)` per turn. |
| **Bulbul voice availability per language** | Not every speaker covers every Indic language equally well. | Test `shreya`, `kavya`, `shubh`, `aditya` first — these are the broad-coverage v3 voices in practice. Cross-check with Sarvam's voice matrix when picking for Tamil/Telugu/Malayalam. |
| **Plugin lags Sarvam API** | Sarvam ships new models (e.g. Sarvam-M, new Bulbul speakers) before the LiveKit plugin enum updates. | Use the HTTP fallback in §7. |
| **`SARVAM_API_KEY` not picked up on Windows** | `os.environ` doesn't refresh inside a running PowerShell session after `setx`. | Set in the same shell with `$env:SARVAM_API_KEY="..."` before running, or put it in `.env` and load via `python-dotenv`. |
| **Auto language switch** | `saaras:v3` can auto-detect, but if you hardcode `language="hi-IN"` you lose code-switch. | Pass `language=None` (or omit) for auto-detect; the model returns the detected code per turn. Verify with a quick test before relying on it. |

---

## 6. Environment variables

| Var | Required | Purpose |
|---|---|---|
| `SARVAM_API_KEY` | **Yes** | Auth for STT, TTS, and LLM calls. Same key for all three. |
| `LIVEKIT_URL` | Yes (for the agent worker) | LiveKit server WSS URL — unrelated to Sarvam but required to run the agent. |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Yes | LiveKit room auth. |

Sources: [PyPI](https://pypi.org/project/livekit-plugins-sarvam/), [LiveKit TTS docs](https://docs.livekit.io/agents/models/tts/plugins/sarvam/).

---

## 7. Fallback wiring — when the plugin lags Sarvam's API

Two real cases where you'll outgrow the plugin:

1. **New Sarvam model not in the plugin's enum** (e.g. `sarvam-m`, future Bulbul voices).
2. **You want a parameter the plugin doesn't expose** (e.g. a brand-new STT diarization flag).

### 7a. LLM fallback via `openai.LLM` (Sarvam is OpenAI-compatible)

Sarvam's chat API is OpenAI-compatible, which means `livekit-plugins-openai` works against it once you override the base URL.

```python
from livekit.plugins import openai

llm = openai.LLM(
    model="sarvam-m",                      # whatever Sarvam exposes today
    api_key=os.environ["SARVAM_API_KEY"],
    base_url="https://api.sarvam.ai/v1",   # confirm in Sarvam dashboard
    temperature=0.3,
)
```

This sidesteps the plugin's hardcoded model list entirely. Tool calling rides on the standard OpenAI tool-calling schema.

### 7b. Custom HTTP wrapper for STT/TTS (subclass the plugin base classes)

For STT/TTS the cleanest path is to subclass LiveKit's `stt.STT` / `tts.TTS` abstract bases and call Sarvam REST directly. Skeleton:

```python
import aiohttp, os
from livekit.agents import tts

class SarvamTTSHTTP(tts.TTS):
    def __init__(self, *, voice: str, language: str, model: str = "bulbul:v3"):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=24000,
            num_channels=1,
        )
        self._voice = voice
        self._language = language
        self._model = model
        self._key = os.environ["SARVAM_API_KEY"]

    def synthesize(self, text: str) -> "tts.ChunkedStream":
        return _Stream(self, text)

class _Stream(tts.ChunkedStream):
    async def _main_task(self):
        async with aiohttp.ClientSession() as s:
            async with s.post(
                "https://api.sarvam.ai/text-to-speech",
                headers={"api-subscription-key": self._tts._key},
                json={
                    "inputs": [self._input_text],
                    "target_language_code": self._tts._language,
                    "speaker": self._tts._voice,
                    "model": self._tts._model,
                    "speech_sample_rate": self._tts.sample_rate,
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                r.raise_for_status()
                payload = await r.json()
                # Sarvam returns base64-encoded WAV chunks; decode + push frames
                for b64 in payload["audios"]:
                    self._event_ch.send_nowait(
                        tts.SynthesizedAudio(frame=_decode_b64_to_frame(b64))
                    )
```

Same shape works for STT (subclass `stt.STT`, implement `recognize()` or `stream()` against Sarvam's `/speech-to-text` endpoint). Confirm exact request shape against [Sarvam's docs](https://www.sarvam.ai/) before shipping — Sarvam has changed header names (`api-subscription-key` vs `Authorization: Bearer`) historically.

### 7c. Hybrid (best of both)

Use the official plugin for the 80% case; wire a custom wrapper class as the `tts=` / `llm=` arg only for the specific model/feature the plugin lacks. `AgentSession` doesn't care which implementation it gets as long as it satisfies the abstract base.

---

## 8. Quick reference — porting from Vapi (Sarvam-as-custom-provider) to LiveKit

| Vapi concept | LiveKit Agents 1.x equivalent |
|---|---|
| `assistant.transcriber` (custom Sarvam) | `AgentSession(stt=sarvam.STT(...))` |
| `assistant.model` (custom Sarvam) | `AgentSession(llm=sarvam.LLM(...))` or `openai.LLM(base_url=...)` |
| `assistant.voice` (custom Sarvam) | `AgentSession(tts=sarvam.TTS(...))` |
| `assistant.firstMessage` | `await session.generate_reply(instructions="...")` after `session.start` |
| `assistant.systemPrompt` | `Agent(instructions="...")` subclass attribute |
| Vapi webhook tools | `@function_tool` decorators on the `Agent` subclass |
| Vapi VAD config | `vad=silero.VAD.load()` + `sarvam.STT(high_vad_sensitivity=True)` |
| Vapi server URL (SIP) | LiveKit SIP trunk → room → agent worker subscribes |

---

## 9. Recommendations for MediCall pilot

- **Pin to `livekit-agents[sarvam]~=1.6`** rather than the bare `livekit-plugins-sarvam` install — keeps the core-agents/plugin version pair in sync and avoids `AgentSession` slot-type errors.
- **Default model trio for the pilot:** `saaras:v3` (STT, language=`None` to auto-detect Hindi/English code-switch) + `sarvam-105b` (LLM) + `bulbul:v3` voice `shreya` or `shubh` (TTS, `target_language_code="hi-IN"`). Swap to `sarvam-30b` if p95 latency exceeds your budget.
- **Tune for telephony day one:** `stt.sample_rate=16000`, `tts.speech_sample_rate=8000`, `tts.output_audio_codec="mulaw"`. Verify with a real PSTN call, not just a browser test — browser audio masks µ-law artifacts.
- **Ship with the HTTP-wrapper escape hatch already in the repo** (a stub `SarvamTTSHTTP` / `SarvamLLMHTTP` next to the plugin import). The plugin will lag Sarvam's release cadence; having the wrapper one import-swap away saves a panic-day later — especially if you actually need Sarvam-M, which the current plugin enum doesn't list.
- **Lock the language code per call leg, but log the detected code every turn.** Mismatch between STT-detected language and TTS `target_language_code` is the #1 "agent sounds dumb" bug in Indic voice pilots.
- **Set `flush_signal=True` + Silero VAD from the start.** Sarvam's native endpointing alone produces noticeable dead air on hesitant elderly callers — the exact population a clinic receptionist agent will see.
- **Don't put `SARVAM_API_KEY` in `~/.claude/settings.json` or any committed file.** Use a project-local `.env` + `python-dotenv`, and add `.env` to `.gitignore` before the first commit.

---

## Sources

- [livekit-plugins-sarvam on PyPI](https://pypi.org/project/livekit-plugins-sarvam/)
- [Sarvam STT plugin guide — LiveKit docs](https://docs.livekit.io/agents/models/stt/plugins/sarvam/)
- [Sarvam TTS plugin guide — LiveKit docs](https://docs.livekit.io/agents/models/tts/plugins/sarvam/)
- [livekit/agents monorepo — sarvam plugin source](https://github.com/livekit/agents/tree/main/livekit-plugins/livekit-plugins-sarvam)
- [Sarvam x LiveKit integration page](https://www.sarvam.ai/integrations/livekit)
- [livekit.plugins.sarvam API reference](https://docs.livekit.io/reference/python/livekit/plugins/sarvam/index.html)
- [livekit-agents on PyPI](https://pypi.org/project/livekit-agents/)
