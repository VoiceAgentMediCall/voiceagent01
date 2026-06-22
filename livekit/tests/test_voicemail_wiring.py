"""Tests for voicemail_detector wiring into agent.py (Task B5).

The real VoicemailDetector exposes `on_user_speech(start_ts, end_ts)` +
`check() -> "HUMAN"|"VOICEMAIL"|"UNKNOWN"` rather than the
`is_voicemail(audio_duration_s, transcript)` signature the plan assumed.
These tests are written against the actual detector shape.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Make `from agent import ...` work when pytest is invoked from voiceagent/livekit
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import (  # noqa: E402
    MAX_CALL_DURATION_SECONDS,
    VOICEMAIL_GREETING_GRACE_SECONDS,
    CallState,
    CallVariables,
    voicemail_check,
)


def _make_state() -> CallState:
    return CallState(
        call_id="test-call",
        started_at=0.0,
        vars=CallVariables(parent_name="Test", drug_name="dawai"),
    )


def test_voicemail_check_sets_flag_when_detector_reports_voicemail():
    state = _make_state()
    session = MagicMock()
    detector = MagicMock()
    detector.check.return_value = "VOICEMAIL"

    event = MagicMock(start_ts=0.0, end_ts=8.5, transcript="please leave a message after the beep")

    voicemail_check(event, state, session, detector)

    assert state.voicemail_detected is True
    # The handler should also have asked the detector to record the utterance
    detector.on_user_speech.assert_called_once()


def test_voicemail_check_does_not_flag_human():
    state = _make_state()
    session = MagicMock()
    detector = MagicMock()
    detector.check.return_value = "HUMAN"

    event = MagicMock(start_ts=0.0, end_ts=1.2, transcript="hai")

    voicemail_check(event, state, session, detector)

    assert state.voicemail_detected is False


def test_voicemail_check_does_not_flag_unknown():
    state = _make_state()
    session = MagicMock()
    detector = MagicMock()
    detector.check.return_value = "UNKNOWN"

    event = MagicMock(start_ts=0.0, end_ts=0.5, transcript="")

    voicemail_check(event, state, session, detector)

    assert state.voicemail_detected is False


def test_watchdog_constants_shrunk():
    """Task B5 requires the watchdog grace and max duration to be shrunk now
    that voicemail detection is wired up and Bug #5 hangs up explicitly."""
    assert VOICEMAIL_GREETING_GRACE_SECONDS == 10.0
    assert MAX_CALL_DURATION_SECONDS == 90
