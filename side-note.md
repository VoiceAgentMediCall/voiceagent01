# Voice Agent — Walkthrough Side Note

> Running scratchpad of open questions, optimisation ideas, and decisions-to-revisit, captured per folder during the folder-by-folder codebase walkthrough.
> Updated continuously across the session. Latest entries appear under each folder.

---

## Folder: `voiceagent/livekit/`

1. Check for an optimised LLM — currently Sarvam-30B.
2. More research on VAD (Silero v5 — a tiny local model that decides "is the user talking right now?") — see if another model optimises here.
3. Why keyword matching on transcript instead of asking an LLM judge "did they confirm?" Current rationale: cheaper + deterministic; LLM judge would cost an extra round-trip + tokens. Revisit.
4. No programmatic hangup bug — needs `@function_tool def end_call()` fix so the LLM can explicitly close the call instead of relying on the 30-second watchdog.
5. `voicemail_detector.py` is NOT wired into `agent.py`. The agent uses a simpler 30-second watchdog. This module exists as the planned v2 upgrade — wire it in when false-positive rate >8%.
6. Discuss Langfuse in depth — what it currently provides (per-call observability: STT span, LLM span, TTS span, latencies, transcript, model cost) and how to optimise / build upon it (dashboards, alerting, cost analytics, regression detection, etc.).

---

## Folder: `voiceagent/admin-panel/` (renamed from `admin-ui`)

1. Discuss whether Streamlit web app is the right choice or something else for the admin UI. The rejected alternatives below were rejected for the single-user PM prototype — we need to revisit what works for production:
   - **Next.js + React + Supabase** — days to build, JS bundler, auth flow, caregiver login. Massive overkill for one PM editing one file.
   - **Direct YAML edit in VS Code** — hostile to non-engineers. Also no path to add eval runner or logs viewer.
   - **Vapi-style hosted dashboard** — doesn't exist for LiveKit; you'd build it yourself anyway.
   - **Streamlit + YAML** — 155 lines, zero JS, runs locally, edits live without restart. *(chosen)*

---

## Folder: `voiceagent/browser-test/` (renamed from `browser-client`)

1. Finalise and confirm whether `admin-panel`, `browser-test`, and `evals` should be merged into a single unified web app. Need inspiration from a unified dashboard such as Vapi's, or something equivalent.

---

## Decision 2026-06-22 — Bug #5 implementation path (Task B1 lock)

**Sarvam-30B tool calling verdict:** ✅ Works.

Verified via direct API call (Invoke-RestMethod, `tool_choice: "required"`) on 2026-06-22:
- `finish_reason: "tool_calls"`
- `tool_calls[0].function.name = "report_outcome"`
- `arguments` parsed cleanly as `{"outcome": "CONFIRMED", "reason": "..."}`
- Notable: sarvam-30b is a reasoning model (returns `reasoning_content`).

**Chosen path:** **Path A** — `@function_tool` decorators on `MediCallAgent` (Tasks B2 + B3 use this).

**Fallback chain in `derive_outcome()`:**
1. `state.reported_outcome` (set via Path A function_tool)
2. JSON trailer regex on agent transcript (defense in depth)
3. Keyword match on user transcript (legacy fallback)
4. Voicemail detector short-circuit → `NO_ANSWER`

---

## Folder: `voiceagent/evals/`

1. No need for three separate scenario files — they can be three cases inside a single Promptfoo golden-set file in the `evals/` folder. Additionally, look at the Promptfoo setup created for HelloCounsel (specifically the config file) to get a proper inspiration on how to build an exact situational-case golden set. Revisit later.
2. If we integrate the eval layer into the admin-UI dashboard, we'll need to go through the entire Railway setup that was required for HelloCounsel.

---
