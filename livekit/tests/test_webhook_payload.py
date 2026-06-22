"""Tests for B6 webhook payload shape and env-var contract.

B6 repoints the end-of-call POST from the legacy Apps Script URL to the
Next.js dashboard endpoint (DASHBOARD_WEBHOOK_URL) and enriches the payload
with the 13 fields the dashboard expects.

These are sync tests — matches the project's existing pytest style (no
pytest-asyncio in requirements). See test_derive_outcome.py for the pattern.

Note on timestamps: production state.started_at is a float (epoch seconds);
post_end_of_call_report serializes via an internal _iso() helper that turns
floats into ISO 8601 UTC strings. The tests below verify the contract end-
to-end with float timestamps to mirror real runtime.
"""
from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Make `from agent import ...` work when pytest is invoked from voiceagent/livekit
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent import CallState, CallVariables  # noqa: E402


def _make_state(**overrides) -> CallState:
    state = CallState(
        call_id="lk_abc",
        started_at=1_750_000_000.0,
        vars=CallVariables(parent_name="Shubh", drug_name="Crocin", phone="+918104348262", prompt_version=1),
        transcript=[
            {"role": "agent", "text": "नमस्ते।"},
            {"role": "user", "text": "हां ले लिया।"},
        ],
        reported_reason="user_confirmed_intake",
        outcome_source="tool_call",
    )
    # Stamp the post-call fields the entrypoint normally sets in its finally block.
    state.ended_at = 1_750_000_017.0  # type: ignore[attr-defined]
    state.duration_sec = 17  # type: ignore[attr-defined]
    state.langfuse_trace_id = "trace_abc"  # type: ignore[assignment]
    for k, v in overrides.items():
        setattr(state, k, v)
    return state


def test_dashboard_webhook_url_env_var_is_required():
    """If DASHBOARD_WEBHOOK_URL is missing, post_end_of_call_report must raise
    loudly (no silent fallback to a placeholder URL, no silent skip)."""
    import agent
    saved = os.environ.pop("DASHBOARD_WEBHOOK_URL", None)
    os.environ.pop("WEBHOOK_URL", None)
    try:
        importlib.reload(agent)
        state = _make_state()
        with patch.object(agent.requests, "post") as mock_post:
            raised: Exception | None = None
            try:
                agent.post_end_of_call_report(state, "CONFIRMED", vars_=state.vars)
            except RuntimeError as exc:
                raised = exc
            assert raised is not None, "Expected RuntimeError when DASHBOARD_WEBHOOK_URL missing"
            assert "DASHBOARD_WEBHOOK_URL" in str(raised)
            mock_post.assert_not_called()
    finally:
        if saved is not None:
            os.environ["DASHBOARD_WEBHOOK_URL"] = saved
        importlib.reload(agent)


def test_payload_contains_all_required_fields():
    """When env is set, the POSTed payload must contain every dashboard-expected field."""
    os.environ["DASHBOARD_WEBHOOK_URL"] = "https://test.example.com/api/webhook/livekit"
    import agent
    importlib.reload(agent)

    captured: dict = {}

    def fake_post(url, json=None, timeout=None, **kwargs):
        captured["url"] = url
        captured["json"] = json
        resp = MagicMock()
        resp.status_code = 200
        resp.text = '{"ok": true}'
        return resp

    state = _make_state()

    with patch.object(agent.requests, "post", side_effect=fake_post):
        agent.post_end_of_call_report(state, "CONFIRMED", vars_=state.vars)

    assert captured["url"] == "https://test.example.com/api/webhook/livekit"
    payload = captured["json"]
    for field in [
        "call_id", "phone", "parent_name", "drug_name", "outcome",
        "outcome_source", "reason", "transcript", "duration_sec",
        "prompt_version", "langfuse_trace_id", "started_at", "ended_at",
    ]:
        assert field in payload, f"Missing field: {field}"
    assert payload["call_id"] == "lk_abc"
    assert payload["phone"] == "+918104348262"
    assert payload["parent_name"] == "Shubh"
    assert payload["drug_name"] == "Crocin"
    assert payload["outcome"] == "CONFIRMED"
    assert payload["outcome_source"] == "tool_call"
    assert payload["reason"] == "user_confirmed_intake"
    assert payload["duration_sec"] == 17
    assert payload["prompt_version"] == 1
    assert payload["langfuse_trace_id"] == "trace_abc"
    # ISO 8601 strings, not floats.
    assert isinstance(payload["started_at"], str) and "T" in payload["started_at"]
    assert isinstance(payload["ended_at"], str) and "T" in payload["ended_at"]


def test_payload_handles_prompt_version_none():
    """When prompts.yaml lacks a `version:` key, prompt_version is None in the payload."""
    os.environ["DASHBOARD_WEBHOOK_URL"] = "https://test.example.com/api/webhook/livekit"
    import agent
    importlib.reload(agent)

    captured: dict = {}

    def fake_post(url, json=None, timeout=None, **kwargs):
        captured["json"] = json
        resp = MagicMock()
        resp.status_code = 200
        return resp

    state = _make_state()
    state.vars = CallVariables(parent_name="Shubh", drug_name="Crocin", phone="+91", prompt_version=None)

    with patch.object(agent.requests, "post", side_effect=fake_post):
        agent.post_end_of_call_report(state, "DENIED", vars_=state.vars)

    assert captured["json"]["prompt_version"] is None
    assert captured["json"]["outcome"] == "DENIED"


def test_callvariables_loader_reads_version_from_yaml(tmp_path, monkeypatch):
    """CallVariables.load() should pick up top-level `version:` from prompts.yaml."""
    import agent
    importlib.reload(agent)

    yaml_path = tmp_path / "prompts.yaml"
    yaml_path.write_text(
        "version: 7\n"
        "system_prompt: |\n"
        "  test prompt\n"
        "first_message: |\n"
        "  hi {parent_name}\n"
        "variables:\n"
        "  parent_name: Test\n"
        "  drug_name: Test\n"
        "  phone: '+910000000000'\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(agent, "PROMPTS_YAML_PATH", yaml_path)
    monkeypatch.delenv("PARENT_NAME", raising=False)
    monkeypatch.delenv("DRUG_NAME", raising=False)
    monkeypatch.delenv("PHONE", raising=False)

    vars_ = agent.CallVariables.load()
    assert vars_.prompt_version == 7


def test_callvariables_loader_missing_version_stays_none(tmp_path, monkeypatch):
    """When prompts.yaml has no `version:` key, prompt_version stays None."""
    import agent
    importlib.reload(agent)

    yaml_path = tmp_path / "prompts.yaml"
    yaml_path.write_text(
        "system_prompt: |\n"
        "  test\n"
        "variables:\n"
        "  parent_name: Test\n"
        "  drug_name: Test\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(agent, "PROMPTS_YAML_PATH", yaml_path)
    monkeypatch.delenv("PARENT_NAME", raising=False)
    monkeypatch.delenv("DRUG_NAME", raising=False)
    monkeypatch.delenv("PHONE", raising=False)

    vars_ = agent.CallVariables.load()
    assert vars_.prompt_version is None
