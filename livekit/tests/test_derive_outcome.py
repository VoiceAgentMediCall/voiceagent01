"""Tests for derive_outcome triple-fallback chain (Task B3).

Priority chain (highest first):
  1. voicemail_detector — short-circuits to NO_ANSWER
  2. tool_call         — Path A: LLM called report_outcome
  3. json_trailer      — Path A.5: agent's last message had JSON trailer
  4. keyword_match     — legacy fallback on user transcript
  5. watchdog          — nothing else fired

These are sync tests (no pytest-asyncio) — matches the project's existing test
style. See test_function_tools.py and test_voicemail_wiring.py for the pattern.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make `from agent import ...` work when pytest is invoked from voiceagent/livekit
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import CallState, CallVariables, derive_outcome  # noqa: E402


def _state(**kwargs) -> CallState:
    """Build a CallState with sensible defaults for the required fields.

    The caller's kwargs override defaults. Unknown attrs are settable after
    construction (CallState is a regular dataclass, not frozen).
    """
    base_kwargs = {
        "call_id": "test-call",
        "started_at": 0.0,
        "vars": CallVariables(parent_name="Test", drug_name="dawai"),
    }
    # Split kwargs into known dataclass fields vs. things we'd need to setattr.
    known = {
        "call_id", "started_at", "vars", "transcript", "last_user_utterance_at",
        "voicemail_detected", "ended", "reported_outcome", "reported_reason",
        "should_end", "outcome_source",
    }
    init_kwargs = {**base_kwargs}
    extra_attrs: dict[str, object] = {}
    for k, v in kwargs.items():
        if k in known:
            init_kwargs[k] = v
        else:
            extra_attrs[k] = v
    state = CallState(**init_kwargs)
    for k, v in extra_attrs.items():
        setattr(state, k, v)
    return state


def test_voicemail_short_circuits_everything():
    """When voicemail_detected, outcome is NO_ANSWER regardless of any tool call."""
    state = _state(voicemail_detected=True, reported_outcome="CONFIRMED")
    assert derive_outcome(state) == ("NO_ANSWER", "voicemail_detector")


def test_primary_path_a_tool_call_confirmed():
    """The Path A primary: LLM called report_outcome with CONFIRMED."""
    state = _state(reported_outcome="CONFIRMED", reported_reason="user said haan")
    assert derive_outcome(state) == ("CONFIRMED", "tool_call")


def test_primary_path_a_tool_call_denied():
    state = _state(reported_outcome="DENIED", reported_reason="user will take later")
    assert derive_outcome(state) == ("DENIED", "tool_call")


def test_primary_path_a_tool_call_escalated():
    state = _state(reported_outcome="ESCALATED", reported_reason="bukhar reported")
    assert derive_outcome(state) == ("ESCALATED", "tool_call")


def test_fallback_json_trailer_in_agent_message():
    """Path A.5: no tool call, but agent's last message has a JSON trailer."""
    state = _state(
        transcript=[
            {"role": "user", "text": "हां ले लिया।"},
            {"role": "agent", "text": 'धन्यवाद।\n{"outcome": "CONFIRMED", "reason": "user confirmed"}'},
        ],
    )
    assert derive_outcome(state) == ("CONFIRMED", "json_trailer")


def test_fallback_json_trailer_escalated():
    state = _state(
        transcript=[
            {"role": "user", "text": "bukhar hai mujhe"},
            {"role": "agent", "text": 'डॉक्टर से बात कीजिये।\n{"outcome": "ESCALATED", "reason": "fever reported"}'},
        ],
    )
    assert derive_outcome(state) == ("ESCALATED", "json_trailer")


def test_fallback_keyword_confirmed():
    state = _state(
        transcript=[
            {"role": "user", "text": "haan le liya"},
            {"role": "agent", "text": "बहुत अच्छा।"},
        ],
    )
    assert derive_outcome(state) == ("CONFIRMED", "keyword_match")


def test_fallback_keyword_denied():
    state = _state(
        transcript=[
            {"role": "user", "text": "nahi abhi nahi"},
            {"role": "agent", "text": "kripya jaldi le lijiye"},
        ],
    )
    assert derive_outcome(state) == ("DENIED", "keyword_match")


def test_fallback_keyword_escalated_symptom():
    state = _state(
        transcript=[
            {"role": "user", "text": "mujhe sir mein dard ho raha hai"},
            {"role": "agent", "text": "kripya doctor se baat kijiye"},
        ],
    )
    assert derive_outcome(state) == ("ESCALATED", "keyword_match")


def test_fallback_keyword_devanagari_confirmed():
    """Keyword match should work on Devanagari user text too."""
    state = _state(
        transcript=[
            {"role": "user", "text": "हां ले लिया"},
        ],
    )
    assert derive_outcome(state) == ("CONFIRMED", "keyword_match")


def test_no_signal_returns_watchdog_no_answer():
    """Empty transcript + no tool call + no voicemail → watchdog NO_ANSWER."""
    state = _state(transcript=[])
    assert derive_outcome(state) == ("NO_ANSWER", "watchdog")


def test_symptom_keyword_beats_confirmed_keyword():
    """If both a symptom and a confirmation are in the user transcript, ESCALATED wins."""
    state = _state(
        transcript=[
            {"role": "user", "text": "haan le liya lekin bukhar bhi hai"},
        ],
    )
    assert derive_outcome(state) == ("ESCALATED", "keyword_match")
