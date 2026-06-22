"""Tests for the report_outcome / end_call function tools on MediCallAgent (Task B2).

These tools let the LLM explicitly signal call outcome + hangup, fixing Bug #5
(the watchdog mislabels confirmed-then-thanked calls as NO_ANSWER because the
LLM's closing "धन्यवाद" doesn't currently trigger end-of-call).

Note: pytest-asyncio is not installed in this project, so async tool bodies are
driven via ``asyncio.run`` from plain sync tests. This mirrors the B5 test style
(all sync) and keeps the test deps unchanged.

``Agent.session`` is a read-only property bound by the LiveKit framework when
``session.start(agent=...)`` runs. We patch it on the class for the duration of
each test so we can inject a mocked session.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

# Make `from agent import ...` work when pytest is invoked from voiceagent/livekit
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from livekit.agents import Agent  # noqa: E402
from agent import CallState, CallVariables, MediCallAgent  # noqa: E402


def _make_state() -> CallState:
    return CallState(
        call_id="test-call",
        started_at=0.0,
        vars=CallVariables(parent_name="Test", drug_name="dawai"),
    )


def _build_test_agent(state: CallState):
    """Build a MediCallAgent with mocked session.

    Returns (agent, session_mock). We bypass __init__ so we don't pull in the
    full Agent superclass machinery, and we patch the read-only ``session``
    property on the Agent class so the tool body can ``await self.session.aclose()``.
    """
    agent = MediCallAgent.__new__(MediCallAgent)
    agent.state = state

    session_mock = MagicMock()
    session_mock.aclose = AsyncMock()
    return agent, session_mock


def _raw_callable(method):
    """function_tool wraps the original async fn. Get back to the plain coroutine
    function so we can call it directly in tests without going through the
    tool-dispatcher / schema-validation path.
    """
    for attr in ("__wrapped__", "fn", "callable", "_fnc", "_callable"):
        inner = getattr(method, attr, None)
        if inner is not None:
            return inner
    return method


def _run_tool(method, agent, session_mock, **kwargs):
    """Invoke a function_tool-wrapped coroutine while ``self.session`` is
    monkey-patched on the Agent class.
    """
    fn = _raw_callable(method)
    with patch.object(Agent, "session", new_callable=PropertyMock, return_value=session_mock):
        return asyncio.run(fn(agent, **kwargs))


def test_report_outcome_sets_confirmed():
    state = _make_state()
    agent, session_mock = _build_test_agent(state)

    _run_tool(agent.report_outcome, agent, session_mock,
              outcome="CONFIRMED", reason="user said haan le liya")

    assert state.reported_outcome == "CONFIRMED"
    assert state.reported_reason == "user said haan le liya"


def test_report_outcome_accepts_denied():
    state = _make_state()
    agent, session_mock = _build_test_agent(state)

    _run_tool(agent.report_outcome, agent, session_mock,
              outcome="DENIED", reason="user will take later")

    assert state.reported_outcome == "DENIED"
    assert state.reported_reason == "user will take later"


def test_report_outcome_accepts_escalated():
    state = _make_state()
    agent, session_mock = _build_test_agent(state)

    _run_tool(agent.report_outcome, agent, session_mock,
              outcome="ESCALATED", reason="symptom: bukhar")

    assert state.reported_outcome == "ESCALATED"
    assert state.reported_reason == "symptom: bukhar"


def test_end_call_sets_should_end_and_closes_session():
    state = _make_state()
    agent, session_mock = _build_test_agent(state)

    _run_tool(agent.end_call, agent, session_mock)

    assert state.should_end is True
    session_mock.aclose.assert_awaited_once()


def test_callstate_has_new_outcome_fields():
    """The dataclass fields must exist with sensible defaults so existing
    instantiations (entrypoint, B5 tests) keep working."""
    state = _make_state()
    assert state.reported_outcome is None
    assert state.reported_reason is None
    assert state.should_end is False
