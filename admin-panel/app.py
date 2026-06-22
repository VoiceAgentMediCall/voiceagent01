"""MediCall Admin UI — Streamlit single-page app.

PM-facing console for editing the agent prompt, viewing call logs, and running evals.
The voice agent re-reads prompts.yaml at the start of each call, so no restart is needed.
"""
from __future__ import annotations

import io
import os
import subprocess
from pathlib import Path

import pandas as pd
import requests
import streamlit as st
import yaml

# ----- Paths -----
BASE_DIR = Path(__file__).parent.resolve()
PROMPTS_PATH = BASE_DIR / "prompts.yaml"
EVALS_DIR = (BASE_DIR.parent / "evals").resolve()

SHEET_CSV_URL = os.environ.get("GOOGLE_SHEET_CSV_URL", "").strip()

# ----- Page setup -----
st.set_page_config(page_title="MediCall Admin", page_icon="📞", layout="wide")
st.title("MediCall Admin Console")
st.caption("Edit the agent prompt, watch calls land, run evals. No restart needed — the agent re-reads prompts.yaml each call.")


# ----- YAML helpers -----
def load_prompts() -> dict:
    if not PROMPTS_PATH.exists():
        return {"system_prompt": "", "first_message": "", "variables": {}}
    with PROMPTS_PATH.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def save_prompts(data: dict) -> None:
    with PROMPTS_PATH.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


prompts = load_prompts()
variables = prompts.get("variables", {}) or {}

# ----- Sidebar -----
with st.sidebar:
    st.header("Stack")
    stack = st.selectbox("Active voice stack", ["livekit", "vapi"], index=0)
    st.info(
        "The agent re-reads `prompts.yaml` at the start of each call. "
        "No restart needed — your next inbound/outbound call uses the new prompt."
    )
    st.markdown("---")
    st.markdown("**Browser test client:** [open localhost:3000](http://localhost:3000)")
    st.markdown(f"**Prompt file:** `{PROMPTS_PATH}`")
    st.markdown(f"**Evals dir:** `{EVALS_DIR}`")


# ----- Prompt editor -----
st.subheader("1. Prompt")
col_a, col_b = st.columns([2, 1])

with col_a:
    system_prompt = st.text_area(
        "System prompt",
        value=prompts.get("system_prompt", ""),
        height=420,
        help="Full instruction the LLM receives. Hindi guardrails live here.",
    )
    first_message = st.text_input(
        "First message (spoken on pickup)",
        value=prompts.get("first_message", "").strip(),
        help="Use {parent_name} and {drug_name} placeholders.",
    )

with col_b:
    st.markdown("**Variables**")
    parent_name = st.text_input("parent_name", value=variables.get("parent_name", ""))
    drug_name = st.text_input("drug_name", value=variables.get("drug_name", ""))
    language = st.selectbox(
        "language",
        ["hi", "en", "hi-en"],
        index=["hi", "en", "hi-en"].index(variables.get("language", "hi")) if variables.get("language", "hi") in ["hi", "en", "hi-en"] else 0,
    )

    if st.button("Save prompt", type="primary", use_container_width=True):
        save_prompts({
            "system_prompt": system_prompt,
            "first_message": first_message,
            "variables": {"parent_name": parent_name, "drug_name": drug_name, "language": language},
        })
        st.toast("Saved. Next call will use the new prompt.", icon="✅")

    with st.expander("Preview rendered first_message"):
        try:
            st.code(first_message.format(parent_name=parent_name, drug_name=drug_name))
        except KeyError as e:
            st.warning(f"Missing variable: {e}")


# ----- Call logs -----
st.subheader("2. Recent call logs (last 20)")
if not SHEET_CSV_URL:
    st.info(
        "Set the `GOOGLE_SHEET_CSV_URL` env var to a published-to-web CSV URL "
        "(File -> Share -> Publish to web -> CSV) to see calls here."
    )
else:
    try:
        resp = requests.get(SHEET_CSV_URL, timeout=10)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        st.dataframe(df.tail(20), use_container_width=True, height=380)
    except Exception as e:
        st.error(f"Could not fetch sheet: {e}")


# ----- Evals -----
st.subheader("3. Promptfoo evals")
if st.button("Run evals now", use_container_width=False):
    if not EVALS_DIR.exists():
        st.error(f"No evals directory at {EVALS_DIR}")
    else:
        with st.spinner("Running promptfoo eval..."):
            try:
                result = subprocess.run(
                    ["promptfoo", "eval"],
                    cwd=str(EVALS_DIR),
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
                if result.returncode == 0:
                    st.success("Evals passed.")
                else:
                    st.error(f"Evals failed (exit {result.returncode}).")
                with st.expander("Eval output", expanded=True):
                    st.code(result.stdout or "(no stdout)")
                    if result.stderr:
                        st.code(result.stderr, language="bash")
            except FileNotFoundError:
                st.error("`promptfoo` not on PATH. Install: `npm i -g promptfoo`.")
            except subprocess.TimeoutExpired:
                st.error("Eval timed out after 180s.")


# ----- Footer -----
st.markdown("---")
st.caption(
    f"Stack: **{stack}** · Prompt path: `{PROMPTS_PATH.name}` · "
    "Single-operator pilot — no auth, no history. See README."
)
