"""MediCall Hindi Pilot — LiveKit Agent entrypoint.

Ports the Vapi assistant (scaffolds/vapi_assistant.json) to LiveKit Agents 1.x.
- STT: Sarvam Saaras v3
- TTS: Sarvam Bulbul v2 (anushka voice, hi-IN)
- LLM: Sarvam-M via openai.LLM fallback (plugin enum lags Sarvam releases —
  see docs/research/livekit-plugins-sarvam.md §7a)
- VAD: Silero
- End-of-call webhook with outcome heuristics + voicemail detection.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests
import yaml
from dotenv import load_dotenv

# Windows cp1252 codec crashes on Devanagari Hindi chars in log messages.
# Force UTF-8 on stdout/stderr so हिन्दी text in transcripts logs cleanly.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from typing import Literal

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.plugins import openai, sarvam, silero

from voicemail_detector import VoicemailDetector

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
logger = logging.getLogger("medicall.livekit")

AGENT_DIR = Path(__file__).resolve().parent
PROMPTS_YAML_PATH = (AGENT_DIR / ".." / "admin-panel" / "prompts.yaml").resolve()

VOICEMAIL_GREETING_GRACE_SECONDS = 10.0  # B5: shrunk from 30s now that VoicemailDetector is wired (Bug #5 hangs up explicitly on success)
SILENCE_TIMEOUT_SECONDS = 8.0
MAX_CALL_DURATION_SECONDS = 90  # B5: shrunk from 120s — matches PRD §1 "keep call under 90 seconds"

CONFIRMED_KEYWORDS = (
    "haan", "haa", "le liya", "ho gaya", "kha liya", "li hai", "liya hai",
    "हां", "हाँ", "ले लिया", "हो गया", "खा लिया",
)
DENIED_KEYWORDS = (
    "nahi", "nahin", "abhi nahi", "नहीं", "अभी नहीं",
)
SYMPTOM_KEYWORDS = (
    "dard", "bukhar", "ulti", "chakkar",
    "दर्द", "बुखार", "उल्टी", "चक्कर",
)

# B3: matches the {"outcome": "..."} JSON trailer the LLM may append to its
# closing message when it didn't call report_outcome.
JSON_TRAILER_RE = re.compile(
    r'\{\s*"outcome"\s*:\s*"(CONFIRMED|DENIED|ESCALATED)"'
)

# ---------------------------------------------------------------------------
# Optional Langfuse decorator (graceful no-op when unconfigured)
# ---------------------------------------------------------------------------


def _noop_observe(*_a: Any, **_kw: Any):
    def _wrap(fn):
        return fn

    return _wrap


if os.getenv("LANGFUSE_PUBLIC_KEY"):
    try:
        from langfuse.decorators import observe  # type: ignore
    except Exception as exc:  # pragma: no cover
        logger.warning("langfuse import failed (%s); continuing without tracing", exc)
        observe = _noop_observe  # type: ignore
else:
    observe = _noop_observe  # type: ignore


# ---------------------------------------------------------------------------
# Prompt / variable loading
# ---------------------------------------------------------------------------


_DEFAULT_SYSTEM_PROMPT = (
    "You are MediCall, a polite AI voice assistant calling an elderly patient in India "
    "to confirm they have taken their scheduled medication. You MUST respond ONLY in Devanagari "
    "Hindi script (देवनागरी). NEVER use Romanized Hindi. Speak warmly. Use the patient's name. "
    "If the patient says yes (हाँ/ले लिया/हो गया): respond 'बहुत अच्छा। अपना ख़याल रखियेगा। धन्यवाद।' and end the call. "
    "If no (नहीं/अभी नहीं/भूल गया): respond 'ठीक है। कृपया जल्दी ले लीजिये।' and end. "
    "If symptom mentioned: respond 'मुझे खेद है। कृपया अपने डॉक्टर से बात कर लीजिये।' and end. "
    "NEVER give medical advice. NEVER alter dosage. Keep call under 90 seconds."
)
_DEFAULT_FIRST_MESSAGE = (
    "नमस्ते {parent_name} जी, मैं मेडीकॉल से बोल रहा हूँ। आपका {drug_name} लेने का समय हो गया है। क्या आपने ले लिया है?"
)


@dataclass
class CallVariables:
    parent_name: str
    drug_name: str
    phone: str = ""
    system_prompt: str = _DEFAULT_SYSTEM_PROMPT
    first_message_template: str = _DEFAULT_FIRST_MESSAGE
    # B6: prompt_version surfaced on the end-of-call webhook so the dashboard
    # can correlate outcomes with the prompt revision that produced them.
    # Sourced from `version:` (top-level) in admin-panel/prompts.yaml.
    # None when the YAML lacks the key — Admin tab (B12) owns adding it.
    prompt_version: Optional[int] = None

    @classmethod
    def load(cls) -> "CallVariables":
        """Read parent_name / drug_name / system_prompt / first_message from prompts.yaml; fall back to env + defaults."""
        parent_name = os.getenv("PARENT_NAME", "")
        drug_name = os.getenv("DRUG_NAME", "")
        phone = os.getenv("PHONE", "")
        system_prompt = _DEFAULT_SYSTEM_PROMPT
        first_message_template = _DEFAULT_FIRST_MESSAGE
        prompt_version: Optional[int] = None

        if PROMPTS_YAML_PATH.exists():
            try:
                with PROMPTS_YAML_PATH.open("r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
                vars_block = data.get("variables") or {}
                parent_name = parent_name or str(vars_block.get("parent_name", "")).strip()
                drug_name = drug_name or str(vars_block.get("drug_name", "")).strip()
                phone = phone or str(vars_block.get("phone", "")).strip()
                yaml_sys = (data.get("system_prompt") or "").strip()
                yaml_first = (data.get("first_message") or "").strip()
                if yaml_sys:
                    system_prompt = yaml_sys
                if yaml_first:
                    first_message_template = yaml_first
                # B6: top-level `version` key — int when present, else None.
                raw_version = data.get("version")
                if raw_version is not None:
                    try:
                        prompt_version = int(raw_version)
                    except (TypeError, ValueError):
                        logger.warning(
                            "prompts.yaml `version` (%r) is not an int; leaving prompt_version=None",
                            raw_version,
                        )
            except Exception as exc:
                logger.warning("Failed to parse %s (%s); using defaults", PROMPTS_YAML_PATH, exc)
        else:
            logger.info("prompts.yaml not found at %s; using env vars + defaults", PROMPTS_YAML_PATH)

        return cls(
            parent_name=parent_name or "Patient",
            drug_name=drug_name or "dawai",
            phone=phone,
            system_prompt=system_prompt,
            first_message_template=first_message_template,
            prompt_version=prompt_version,
        )


SYSTEM_PROMPT = """You are MediCall, a polite AI voice assistant calling an elderly patient in India
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
5. If silence > 8 seconds at any point: end the call → outcome=NO_ANSWER."""


def build_first_message(vars_: CallVariables) -> str:
    try:
        return vars_.first_message_template.format(
            parent_name=vars_.parent_name,
            drug_name=vars_.drug_name,
        )
    except (KeyError, IndexError) as exc:
        logger.warning("first_message template missing key (%s); falling back to default", exc)
        return _DEFAULT_FIRST_MESSAGE.format(
            parent_name=vars_.parent_name,
            drug_name=vars_.drug_name,
        )


# ---------------------------------------------------------------------------
# Call state + outcome derivation
# ---------------------------------------------------------------------------


@dataclass
class CallState:
    call_id: str
    started_at: float
    vars: CallVariables
    transcript: list[dict[str, str]] = field(default_factory=list)
    last_user_utterance_at: Optional[float] = None
    voicemail_detected: bool = False
    ended: bool = False
    # B2: explicit outcome reported by the LLM via report_outcome tool.
    # When set, derive_outcome should prefer this over keyword heuristics.
    reported_outcome: Optional[str] = None     # "CONFIRMED" | "DENIED" | "ESCALATED"
    reported_reason: Optional[str] = None
    # B2: end_call tool flips this so the watchdog can short-circuit cleanly.
    should_end: bool = False
    # B3: which mechanism in the fallback chain produced the final outcome
    # (tool_call | json_trailer | keyword_match | voicemail_detector | watchdog).
    # Populated by derive_outcome; surfaced on the webhook for the dashboard
    # `outcome_source` column.
    outcome_source: Optional[str] = None
    # B6: Langfuse trace id (when LANGFUSE_PUBLIC_KEY is set), passed through to
    # the dashboard so operators can jump from a row to the full trace.
    langfuse_trace_id: Optional[str] = None

    def append(self, role: str, text: str) -> None:
        if not text:
            return
        self.transcript.append({"role": role, "text": text, "t": round(time.time() - self.started_at, 2)})
        if role == "user":
            self.last_user_utterance_at = time.time()

    def transcript_text(self) -> str:
        return " ".join(turn["text"].lower() for turn in self.transcript if turn["role"] == "user")


def derive_outcome(state: CallState) -> tuple[str, str]:
    """Decide the final outcome label using a triple-fallback chain (Task B3).

    Returns ``(outcome, source)`` where ``source`` is one of
    ``tool_call | json_trailer | keyword_match | voicemail_detector | watchdog``.

    Priority (highest wins):
      1. ``voicemail_detector`` — short-circuits everything to ``NO_ANSWER``.
      2. ``tool_call``          — Path A: LLM called ``report_outcome`` explicitly.
      3. ``json_trailer``       — Path A.5: LLM emitted ``{"outcome": "..."}``
                                  in its most recent agent message.
      4. ``keyword_match``      — legacy fallback on the aggregated user transcript.
                                  Symptom keywords beat confirmation keywords so a
                                  user who reports a side-effect alongside "haan"
                                  still escalates.
      5. ``watchdog``           — nothing else fired; assume NO_ANSWER.
    """
    if state.voicemail_detected:
        return ("NO_ANSWER", "voicemail_detector")

    if state.reported_outcome:
        return (state.reported_outcome, "tool_call")

    transcript = getattr(state, "transcript", None) or []

    # JSON trailer scan — only the most recent agent message matters.
    for msg in reversed(transcript):
        if msg.get("role") == "agent":
            m = JSON_TRAILER_RE.search(msg.get("text", ""))
            if m:
                return (m.group(1), "json_trailer")
            break  # only scan the most recent agent message

    # Keyword match on aggregated user transcript. Symptom check runs first so
    # "haan le liya lekin bukhar bhi hai" routes to ESCALATED.
    user_text = " ".join(
        (m.get("text", "") or "").lower() for m in transcript if m.get("role") == "user"
    )
    if any(k.lower() in user_text for k in SYMPTOM_KEYWORDS):
        return ("ESCALATED", "keyword_match")
    if any(k.lower() in user_text for k in CONFIRMED_KEYWORDS):
        return ("CONFIRMED", "keyword_match")
    if any(k.lower() in user_text for k in DENIED_KEYWORDS):
        return ("DENIED", "keyword_match")

    return ("NO_ANSWER", "watchdog")


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------


def _get_dashboard_webhook_url() -> str:
    """Lazy-read DASHBOARD_WEBHOOK_URL so import-time doesn't fail in tests.

    Raises RuntimeError loudly if missing — we never want to silently fall back
    to a stale Apps Script URL (B6: legacy WEBHOOK_URL retired in favor of the
    Next.js dashboard endpoint).
    """
    url = (os.environ.get("DASHBOARD_WEBHOOK_URL") or "").strip()
    if not url:
        raise RuntimeError(
            "DASHBOARD_WEBHOOK_URL env var is required. Set to the Next.js "
            "endpoint, e.g. https://medicall-next-app.up.railway.app/api/webhook/livekit"
        )
    return url


def _iso(ts: Any) -> Optional[str]:
    """Best-effort ISO 8601 UTC string for a timestamp.

    Accepts:
      - float / int epoch seconds  → ``datetime.fromtimestamp(..., tz=UTC).isoformat()``
      - datetime                   → ``ts.isoformat()``
      - anything with ``.isoformat()`` (e.g. MagicMock in tests) → that
      - None                        → None
    """
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts.isoformat()
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    iso = getattr(ts, "isoformat", None)
    if callable(iso):
        try:
            return iso()
        except Exception:
            return None
    return None


@observe(name="medicall.post_end_of_call_report")
def post_end_of_call_report(
    state: CallState,
    outcome: str,
    vars_: Optional[CallVariables] = None,
) -> None:
    """POST the end-of-call report to the Next.js dashboard endpoint.

    B6: payload contract is the 13 fields the dashboard's
    ``/api/webhook/livekit`` route expects. ``vars_`` is accepted as a kwarg so
    callers can pass an override; defaults to ``state.vars`` (the production
    path).
    """
    url = _get_dashboard_webhook_url()

    if vars_ is None:
        vars_ = getattr(state, "vars", None)

    # Compute duration_sec — prefer an explicit one on state (tests inject it),
    # fall back to (ended_at - started_at) when both are floats.
    ended_at_ts = getattr(state, "ended_at", None)
    if ended_at_ts is None:
        ended_at_ts = time.time()
    started_at_ts = getattr(state, "started_at", None)

    duration_sec = getattr(state, "duration_sec", None)
    if duration_sec is None and isinstance(ended_at_ts, (int, float)) and isinstance(started_at_ts, (int, float)):
        duration_sec = int(round(float(ended_at_ts) - float(started_at_ts)))

    # `phone` typically lives on vars_; tests may stamp it on state directly.
    phone = getattr(state, "phone", None) or (getattr(vars_, "phone", None) if vars_ else None)

    payload = {
        "call_id": state.call_id,
        "phone": phone,
        "parent_name": getattr(vars_, "parent_name", None) if vars_ else None,
        "drug_name": getattr(vars_, "drug_name", None) if vars_ else None,
        "outcome": outcome,
        # B3: which fallback path produced the outcome.
        "outcome_source": getattr(state, "outcome_source", None),
        "reason": getattr(state, "reported_reason", None),
        "transcript": getattr(state, "transcript", []),
        "duration_sec": duration_sec,
        # B6: prompt revision from prompts.yaml — None when no `version:` key.
        "prompt_version": getattr(vars_, "prompt_version", None) if vars_ else None,
        "langfuse_trace_id": getattr(state, "langfuse_trace_id", None),
        "started_at": _iso(started_at_ts),
        "ended_at": _iso(ended_at_ts),
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        logger.info("Dashboard webhook POST %s → %s", url, resp.status_code)
    except Exception as exc:
        logger.error("Dashboard webhook POST failed: %s", exc)


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


def voicemail_check(event: Any, state: CallState, session: Any, detector: VoicemailDetector) -> None:
    """Per-utterance voicemail check.

    Called on each ``user_speech_committed`` event. Records the utterance
    boundary with the stateful ``VoicemailDetector`` and asks for a verdict.
    On VOICEMAIL: flips ``state.voicemail_detected`` and asynchronously
    closes the session so the watchdog/finalizer path takes over.

    The detector is injected (not constructed here) so tests can mock it and
    the entrypoint can keep one instance alive across the whole call leg.
    """
    start_ts = getattr(event, "start_ts", None)
    end_ts = getattr(event, "end_ts", None)
    if start_ts is not None and end_ts is not None:
        try:
            detector.on_user_speech(float(start_ts), float(end_ts))
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("voicemail detector on_user_speech failed: %s", exc)

    try:
        verdict = detector.check()
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("voicemail detector check failed: %s", exc)
        return

    if verdict == "VOICEMAIL":
        logger.info("VoicemailDetector verdict=VOICEMAIL — flagging and closing session")
        state.voicemail_detected = True
        try:
            asyncio.create_task(session.aclose())
        except RuntimeError:
            # No running loop (e.g. in unit tests) — just flag and let
            # callers handle teardown.
            pass


class MediCallAgent(Agent):
    def __init__(self, vars_: CallVariables, state: Optional["CallState"] = None) -> None:
        super().__init__(instructions=vars_.system_prompt)
        self._vars = vars_
        # B2: state is wired in so function tools can record outcomes.
        # Optional for backward-compatibility with any caller that didn't pass it.
        self.state = state

    @function_tool
    async def report_outcome(
        self,
        outcome: Literal["CONFIRMED", "DENIED", "ESCALATED"],
        reason: str,
    ) -> str:
        """Report the outcome of the call when the user's intent is clear.

        CONFIRMED = user said yes / took medicine (haan, le liya, ho gaya, kha liya).
        DENIED = user said no / won't take now (nahi, abhi nahi, bhool gaya).
        ESCALATED = user reported a symptom (dard, bukhar, ulti, chakkar, side effect).

        Call this EXACTLY ONCE per call, after the user's response is unambiguous,
        BEFORE saying your closing sentence. Do not call this for small-talk or
        clarification turns.
        """
        if self.state is not None:
            self.state.reported_outcome = outcome
            self.state.reported_reason = reason
        logger.info("LLM reported outcome=%s reason=%s", outcome, reason)
        return "ok"

    @function_tool
    async def end_call(self) -> str:
        """Close the call. Call this AFTER report_outcome and AFTER speaking your
        closing sentence (e.g., 'धन्यवाद। अपना ख्याल रखियेगा।'). This terminates
        the session and triggers the end-of-call webhook.
        """
        if self.state is not None:
            self.state.should_end = True
        logger.info("LLM requested end_call — closing session")
        try:
            await self.session.aclose()
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("session.aclose raised during end_call: %s", exc)
        return "ok"


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


@observe(name="medicall.entrypoint")
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    vars_ = CallVariables.load()
    state = CallState(
        call_id=str(uuid.uuid4()),
        started_at=time.time(),
        vars=vars_,
    )

    logger.info(
        "Starting call %s for %s (drug=%s, phone=%s)",
        state.call_id, vars_.parent_name, vars_.drug_name, vars_.phone or "n/a",
    )

    # LLM: Sarvam-30B via OpenAI-compatible endpoint (sarvam-m deprecated 2026-06; sarvam-105b also available)
    sarvam_key = os.environ.get("SARVAM_API_KEY", "")
    llm = openai.LLM(
        model="sarvam-30b",
        api_key=sarvam_key,
        base_url="https://api.sarvam.ai/v1",
        temperature=0.3,
    )

    session = AgentSession(
        stt=sarvam.STT(
            model="saaras:v3",
            language="hi-IN",
            mode="transcribe",
            sample_rate=16000,
            high_vad_sensitivity=True,
            flush_signal=True,
        ),
        llm=llm,
        tts=sarvam.TTS(
            target_language_code="hi-IN",
            model="bulbul:v2",
            speaker="anushka",
            speech_sample_rate=8000,
            output_audio_codec="mulaw",
            pace=0.95,
            min_buffer_size=50,
            max_chunk_length=150,
            send_completion_event=True,
        ),
        vad=silero.VAD.load(),
    )

    # ---- Voicemail detector (stateful across the whole call leg) -----------
    voicemail_detector = VoicemailDetector(monologue_max_s=7.0)

    # ---- Transcript capture + voicemail wiring -----------------------------
    @session.on("user_speech_committed")
    def _on_user(ev: Any) -> None:  # pragma: no cover - runtime hook
        try:
            text = getattr(ev, "alternatives", [None])[0]
            text = getattr(text, "text", None) or getattr(ev, "transcript", "") or str(ev)
        except Exception:
            text = str(ev)
        state.append("user", text)
        # B5: feed the detector and flip state if it says VOICEMAIL.
        voicemail_check(ev, state, session, voicemail_detector)

    @session.on("agent_speech_committed")
    def _on_agent(ev: Any) -> None:  # pragma: no cover - runtime hook
        text = getattr(ev, "text", None) or str(ev)
        state.append("agent", text)
        # B5: starts the detector's "did anyone reply?" timer.
        voicemail_detector.on_agent_speech_end(time.time())

    # ---- Start + first message ---------------------------------------------
    await session.start(agent=MediCallAgent(vars_, state=state), room=ctx.room)
    first_message = build_first_message(vars_)
    state.append("agent", first_message)
    await session.say(first_message, allow_interruptions=True)

    # ---- Voicemail / silence watchdog --------------------------------------
    async def _watchdog() -> None:
        # Voicemail check: no human utterance within 4s of greeting end
        await asyncio.sleep(VOICEMAIL_GREETING_GRACE_SECONDS)
        if state.last_user_utterance_at is None:
            logger.info("Voicemail suspected — no utterance within %.1fs", VOICEMAIL_GREETING_GRACE_SECONDS)
            state.voicemail_detected = True
            state.ended = True
            return

        # Silence timeout loop
        deadline = state.started_at + MAX_CALL_DURATION_SECONDS
        while not state.ended and time.time() < deadline:
            await asyncio.sleep(1.0)
            last = state.last_user_utterance_at or state.started_at
            if time.time() - last > SILENCE_TIMEOUT_SECONDS:
                logger.info("Silence > %.0fs — ending call", SILENCE_TIMEOUT_SECONDS)
                state.ended = True
                return
        state.ended = True

    watchdog_task = asyncio.create_task(_watchdog())

    try:
        await watchdog_task
    finally:
        outcome, source = derive_outcome(state)
        state.outcome_source = source
        # B6: stamp wall-clock end + duration so post_end_of_call_report can
        # serialize ISO 8601 timestamps and a duration_sec int for the dashboard.
        ended_at_ts = time.time()
        state.ended_at = ended_at_ts  # type: ignore[attr-defined]
        state.duration_sec = int(round(ended_at_ts - state.started_at))  # type: ignore[attr-defined]
        # B6: best-effort Langfuse trace id pass-through.
        if state.langfuse_trace_id is None:
            try:
                from langfuse.decorators import langfuse_context  # type: ignore
                trace_id = langfuse_context.get_current_trace_id()
                if trace_id:
                    state.langfuse_trace_id = str(trace_id)
            except Exception:
                # langfuse not configured / decorator no-op; leave as None.
                pass
        logger.info(
            "Call %s ended outcome=%s source=%s voicemail=%s",
            state.call_id, outcome, source, state.voicemail_detected,
        )
        try:
            await session.aclose()
        except Exception:
            pass
        try:
            post_end_of_call_report(state, outcome, vars_=vars_)
        except RuntimeError as exc:
            # B6: env var missing — log loudly so prod ops notices, but don't
            # crash the worker. The dashboard is the sink of record; missing
            # URL means dropped call data, not corrupted call.
            logger.error("Skipping dashboard POST: %s", exc)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
