"""Langfuse integration for MediCall LiveKit agent — turn-level + call-level tracing.

Usage:
    from langfuse_integration import init_langfuse, trace_call

    lf = init_langfuse()  # reads LANGFUSE_* env; returns None if unset
    with trace_call(call_id="abc123", parent_name="Sharma", drug_name="Metformin") as trace:
        # ... run agent turns; for each turn:
        trace.log_turn(user_text="haan le liya", assistant_text="bahut achha", latency_ms=420, model="gpt-4o-mini")
        trace.finalize(outcome="CONFIRMED", duration_seconds=18.4, voicemail_detected=False, cost_usd=None)
"""
from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import Optional

try:
    from langfuse import Langfuse  # type: ignore
except ImportError:  # langfuse not installed — module becomes a no-op
    Langfuse = None  # type: ignore

_client: Optional["Langfuse"] = None


def init_langfuse() -> Optional["Langfuse"]:
    """Factory: returns a Langfuse client or None if env keys are missing."""
    global _client
    if _client is not None:
        return _client
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
    if not public_key or not secret_key or Langfuse is None:
        return None
    _client = Langfuse(public_key=public_key, secret_key=secret_key, host=host)
    return _client


class _TraceWrapper:
    """Thin wrapper exposing log_turn() and finalize() on a Langfuse trace."""

    def __init__(self, trace):
        self._trace = trace

    def log_turn(self, user_text: str, assistant_text: str, latency_ms: int, model: str) -> None:
        if self._trace is None:
            return
        self._trace.span(
            name="turn",
            input={"user": user_text},
            output={"assistant": assistant_text},
            metadata={"latency_ms": latency_ms, "model": model},
        )

    def finalize(
        self,
        outcome: str,
        duration_seconds: float,
        voicemail_detected: bool,
        cost_usd: Optional[float] = None,
    ) -> None:
        if self._trace is None:
            return
        self._trace.update(
            metadata={
                "outcome": outcome,
                "duration_seconds": duration_seconds,
                "voicemail_detected": voicemail_detected,
                "cost_usd": cost_usd,
            }
        )


class _NullTrace:
    """No-op trace returned when Langfuse is not configured."""

    def log_turn(self, *args, **kwargs) -> None:
        return

    def finalize(self, *args, **kwargs) -> None:
        return


@contextmanager
def trace_call(call_id: str, parent_name: str, drug_name: str):
    """Context manager opening a Langfuse trace for one call. No-op if Langfuse unset."""
    client = init_langfuse()
    if client is None:
        yield _NullTrace()
        return
    started = time.time()
    trace = client.trace(
        id=call_id,
        name="medicall.voice_call",
        metadata={"parent_name": parent_name, "drug_name": drug_name},
        tags=["medicall", "voice", "livekit"],
    )
    try:
        yield _TraceWrapper(trace)
    finally:
        if not trace.metadata or "duration_seconds" not in (trace.metadata or {}):
            trace.update(metadata={"wall_clock_seconds": round(time.time() - started, 2)})
        try:
            client.flush()
        except Exception:
            pass
