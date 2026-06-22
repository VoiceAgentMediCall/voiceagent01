# MediCall Admin UI

A one-page Streamlit console for the MediCall pilot operator (PM). Edit the agent
prompt, glance at the last 20 calls, run evals, and open the browser test client —
all without touching code or restarting anything.

## Install & run

```bash
cd admin-panel
pip install -r requirements.txt

# Optional: point at a publicly published Google Sheet CSV for the call-logs panel.
# In Google Sheets: File -> Share -> Publish to web -> CSV -> copy the URL.
export GOOGLE_SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/<id>/pub?output=csv"

streamlit run app.py
```

Open the URL Streamlit prints (default: http://localhost:8501).

## How a PM uses it

Three steps, every time you want to tweak how the agent talks:

1. **Edit the text** in the System prompt / First message / Variables panel.
2. **Click "Save prompt"** — a toast confirms the YAML is written.
3. **Next call uses the new prompt.** No restart, no deploy. The agent reads
   `prompts.yaml` at the start of every call.

## Where the prompt is consumed

`prompts.yaml` lives in this folder and is read by the running voice agent:

- LiveKit stack: `../livekit/agent.py` loads it on each call entry.
- Vapi stack: the same YAML is used to regenerate the Vapi assistant config
  via `../scaffolds/create_vapi_assistant.sh` when you want Vapi to take over.

The variables block (`parent_name`, `drug_name`, `language`) substitutes into
`first_message` and is passed to the LLM as call metadata.

## Panels

| Panel | What it does |
|-------|--------------|
| 1. Prompt | Edit system prompt, first message, and per-call variables. Save writes YAML. |
| 2. Call logs | Last 20 rows from the Google Sheet webhook log. Requires `GOOGLE_SHEET_CSV_URL`. |
| 3. Promptfoo evals | Runs `promptfoo eval` in `../evals` and shows pass/fail + output. |
| Sidebar | Stack selector (livekit / vapi), browser test client link, file paths. |

## Limitations (pilot-only, by design)

- **No auth.** Single-operator console, run locally or behind a VPN. Do not expose to the internet.
- **No edit history.** Last save wins. Snapshot `prompts.yaml` via git if you want a paper trail.
- **No multi-tenant.** One YAML, one agent persona. Adding patients = editing variables, not adding rows.
- **No live call streaming.** The logs panel polls the published-CSV sheet on page load. Refresh to update.
- **Promptfoo button requires** `promptfoo` on PATH (`npm i -g promptfoo`) and an `../evals` directory.

When the pilot graduates past one operator, swap this for a real admin app
(Next.js + Postgres + auth). Until then, Streamlit + YAML is the right altitude.
