"""Voicemail vs human detection for LiveKit voice agents.

This is a higher-level classifier that sits ABOVE Silero VAD. Silero handles
raw speech/non-speech segmentation upstream; this module consumes those
segment boundaries to decide whether the far-end is a live human or a
voicemail/IVR system based on response timing and monologue length.

Design rationale: see voiceagent/docs/research/silero-vad-voicemail.md

Heuristics:
    1. After the agent finishes its greeting, a live human typically responds
       within ~4s. Sustained silence past `greeting_max_silence_s` strongly
       suggests we hit a voicemail beep with no listener.
    2. Voicemail greetings are long, uninterrupted monologues. Any single
       user "utterance" exceeding `monologue_max_s` without yielding the
       floor is treated as a recorded greeting.

Usage example (LiveKit AgentSession integration):

    detector = VoicemailDetector()

    @session.on("agent_speech_committed")
    def _on_agent_done(ev):
        detector.on_agent_speech_end(time.time())

    @session.on("user_speech_committed")
    def _on_user_speech(ev):
        detector.on_user_speech(ev.start_ts, ev.end_ts)
        if detector.check() == "VOICEMAIL":
            await session.say("Please call us back at...")
            await session.aclose()
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import List, Literal, Optional

Verdict = Literal["HUMAN", "VOICEMAIL", "UNKNOWN"]


@dataclass
class _Utterance:
    start_ts: float
    end_ts: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end_ts - self.start_ts)


@dataclass
class VoicemailDetector:
    """Classify the far-end as HUMAN, VOICEMAIL, or UNKNOWN.

    Args:
        greeting_max_silence_s: Max seconds of silence after the agent
            greeting before we assume nobody is listening (voicemail beep
            silence, or recorded greeting still playing past expected reply).
        monologue_max_s: Max seconds a single user utterance can run before
            we treat it as a recorded voicemail greeting rather than speech.
    """

    greeting_max_silence_s: float = 4.0
    monologue_max_s: float = 7.0

    _agent_speech_end_ts: Optional[float] = field(default=None, init=False)
    _utterances: List[_Utterance] = field(default_factory=list, init=False)

    def on_agent_speech_end(self, timestamp: float) -> None:
        """Mark when the agent finished speaking; starts the response timer."""
        self._agent_speech_end_ts = timestamp

    def on_user_speech(self, start_ts: float, end_ts: float) -> None:
        """Record a completed user utterance from upstream VAD."""
        if end_ts < start_ts:
            return
        self._utterances.append(_Utterance(start_ts=start_ts, end_ts=end_ts))

    def check(self) -> Verdict:
        """Return current classification verdict."""
        # Long monologue → voicemail greeting playback.
        for utt in self._utterances:
            if utt.duration > self.monologue_max_s:
                return "VOICEMAIL"

        # Agent has spoken and nobody has replied within the window → voicemail.
        if self._agent_speech_end_ts is not None and not self._utterances:
            elapsed = time.time() - self._agent_speech_end_ts
            if elapsed > self.greeting_max_silence_s:
                return "VOICEMAIL"
            return "UNKNOWN"

        # Got at least one normal-length utterance → real human on the line.
        if self._utterances:
            return "HUMAN"

        return "UNKNOWN"

    def reset(self) -> None:
        """Clear state for a new call leg."""
        self._agent_speech_end_ts = None
        self._utterances.clear()
