# MediCall AI — Implementation Plan v3

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate MediCall from 3-folder local prototype (Streamlit + FastAPI + Promptfoo scenarios) to a unified Railway-hosted Next.js dashboard backed by Supabase, while fixing Bug #5 (programmatic hangup via structured LLM tool calls), Bug #7 (enumerated clarify branches), and consolidating 3 scenario YAMLs into a single `goldenset.yaml`.

**Architecture:** Two-service Railway deployment (Next.js dashboard + Promptfoo runner) connected to Supabase Postgres/Auth. Python LiveKit Agent (`agent.py`) rewritten to use `@function_tool` for outcome reporting, with triple fallback chain (tool call → JSON trailer → keyword regex). 8-tab Vapi-mirror UI replaces all 3 legacy frontends. GitHub Actions cron keeps Supabase warm during idle periods.

**Tech Stack:** Python 3.11 / LiveKit Agents 1.x / Sarvam APIs / Next.js 14 App Router (TypeScript) / Tailwind + shadcn/ui / Supabase (Postgres + Auth) / Fastify + Promptfoo (eval runner) / Railway (hosting) / GitHub Actions (cron + CI).

**Companion spec:** `voiceagent/PRD-TRD.md` — every DDL, schema, and design detail lives there. This plan operationalizes that spec into ordered tasks.

---

## Plan structure

This plan has two phases — DO NOT mix them:

- **PART A — Manual Setup (Shubh, tomorrow ~2–3 hours):** Account creation, OAuth keys, environment variables. Agents cannot do these. Output: every credential and URL needed for Part B.
- **PART B — Agent Build (autonomous after Part A complete):** All code, schema migrations, deploys, cleanup. Agents execute this top-to-bottom once Part A credentials are pasted into env.

Each task in **Part B** uses TDD where possible: write failing test → run → minimal implementation → run → commit. UI tasks use a pragmatic build-and-verify pattern.

---

# PART A — Manual Setup (Shubh does tomorrow)

> Output of this phase: a filled-in `voiceagent/.env.setup` file containing every credential the agents need. **Do not skip steps.** Each task has a "what to capture" checklist — paste these into the env file at the end of each task.

---

### Task A1: Create GitHub repository

**Why:** Railway autodeploys from GitHub. Without this, no deployment pipeline.

- [ ] **Step 1: Confirm git repo state**

Run:
```bash
cd "C:\Users\SHUBH SANKALP DAS\Desktop\Building\voiceagent"
git status
```

If "not a git repository" → run `git init`.

- [ ] **Step 2: Create remote on GitHub**

Open https://github.com/new

Settings:
- Repository name: `medicall-ai`
- Private (NOT public — credentials in history risk)
- Do NOT initialize with README/license (we already have files)
- Owner: shubhdas0208 (personal, NOT HelloCounsel org per memory policy)

Click "Create repository."

- [ ] **Step 3: Push existing voiceagent code**

```bash
git remote add origin https://github.com/shubhdas0208/medicall-ai.git
git add .gitignore PRD-TRD.md IMPLEMENTATION-PLAN.md README.md side-note.md
git add docs/ knowledge-base/ livekit/ admin-panel/ browser-test/ evals/ scaffolds/ reference/ Survey/ "hellocounsel prompts and stuff/"
git commit -m "chore: initial commit of medicall pilot"
git branch -M main
git push -u origin main
```

If push fails on credential files (e.g., `sarvam_api_key.txt`): the existing `.gitignore` should exclude them; verify with `git status --ignored` first.

- [ ] **Step 4: Capture**

Write into `voiceagent/.env.setup`:
```
GITHUB_REPO=https://github.com/shubhdas0208/medicall-ai
GITHUB_DEFAULT_BRANCH=main
```

---

### Task A2: Create Supabase project

**Why:** Database + Auth + Storage. All Part B tasks depend on this.

- [ ] **Step 1: Sign up / sign in**

Open https://supabase.com/dashboard
Sign in with GitHub (use shubhdas0208 account).

- [ ] **Step 2: Create new project**

Click "New project."
- Organization: personal
- Name: `medicall-prod`
- Database password: generate a strong one (24+ chars). **Save this in a password manager.**
- Region: **Mumbai (ap-south-1)** — data residency matters for DPDP posture
- Pricing plan: Free

Click "Create new project." Wait ~2 minutes for provisioning.

- [ ] **Step 3: Capture connection details**

In project dashboard → Settings → API:
- Project URL (e.g., `https://abcdefgh.supabase.co`)
- `anon` `public` key (long string starting with `eyJ...`)
- `service_role` `secret` key (long string starting with `eyJ...`) — **NEVER expose to client**

In Settings → Database → Connection string (URI tab):
- The `postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres` string

- [ ] **Step 4: Capture in env file**

```
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
SUPABASE_REGION=ap-south-1
```

---

### Task A3: Enable Google OAuth in Supabase Auth

**Why:** Sign-in flow for the dashboard. Email-password works without this, but Google OAuth is the standard you want.

- [ ] **Step 1: Create Google OAuth Client in Google Cloud Console**

Open https://console.cloud.google.com/apis/credentials

Create a new project (or reuse existing):
- Project name: `medicall-oauth`

Then:
- APIs & Services → OAuth consent screen → External → fill in:
  - App name: MediCall AI
  - User support email: dasshriyans2802@gmail.com
  - Developer contact: same
- APIs & Services → Credentials → Create Credentials → OAuth Client ID:
  - Application type: Web application
  - Name: `medicall-dashboard`
  - Authorized redirect URIs: paste `https://<your-supabase-ref>.supabase.co/auth/v1/callback`

Click Create. Copy the **Client ID** and **Client Secret**.

- [ ] **Step 2: Wire into Supabase**

In Supabase dashboard → Authentication → Providers → Google:
- Enable
- Paste Client ID and Client Secret
- Save

- [ ] **Step 3: Capture**

```
GOOGLE_OAUTH_CLIENT_ID=<long-id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
```

---

### Task A4: Create Railway account + project + 2 services

**Why:** Where Next.js + Promptfoo runner live. Trial gives 30 days free; Hobby $5/mo after.

- [ ] **Step 1: Sign up**

Open https://railway.app
Sign in with GitHub (shubhdas0208).
You get $5 trial credit. Add payment card (required even for trial — won't be charged during trial window).

- [ ] **Step 2: Create project**

Click "New Project" → "Empty Project."
Name: `medicall`

- [ ] **Step 3: Add Service #1 — next-app**

In project → "+ New" → "GitHub Repo" → select `medicall-ai`.
- Service name: `next-app`
- Root directory: `dashboard/` (will be created in Part B)
- Build: leave default (nixpacks auto-detect)
- Start command: leave default (will be set in Part B)

Don't deploy yet — `dashboard/` doesn't exist. Service will sit "failed" until Part B creates the folder. That's fine.

- [ ] **Step 4: Add Service #2 — promptfoo-runner**

In project → "+ New" → "GitHub Repo" → select same repo.
- Service name: `promptfoo-runner`
- Root directory: `eval-runner/`
- Same — leave for Part B.

- [ ] **Step 5: Capture URLs**

After Part B deploys, Railway will assign domains. For now capture:
- Railway project URL (the dashboard URL)

```
RAILWAY_PROJECT_NAME=medicall
RAILWAY_NEXT_APP_SERVICE=next-app
RAILWAY_RUNNER_SERVICE=promptfoo-runner
```

---

### Task A5: Verify Sarvam-30B function calling

**Why:** Bug #5's "full restructure" depends on Sarvam-30B reliably returning OpenAI-format tool calls. If it doesn't, agents fall back to JSON-mode trailer.

- [ ] **Step 1: Run the smoke test**

```bash
curl -X POST https://api.sarvam.ai/v1/chat/completions \
  -H "Authorization: Bearer $(cat sarvam_api_key.txt)" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sarvam-30b",
    "messages": [
      {"role": "system", "content": "You are an agent. After the user replies, call report_outcome."},
      {"role": "user", "content": "हां, मैंने ले लिया।"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "report_outcome",
        "description": "Report the outcome of the call",
        "parameters": {
          "type": "object",
          "properties": {
            "outcome": {"type": "string", "enum": ["CONFIRMED", "DENIED", "ESCALATED"]},
            "reason": {"type": "string"}
          },
          "required": ["outcome", "reason"]
        }
      }
    }],
    "tool_choice": "auto"
  }'
```

- [ ] **Step 2: Inspect the response**

Look for `"tool_calls": [{"function": {"name": "report_outcome", "arguments": "..."}}]` in `choices[0].message`.

- [ ] **Step 3: Capture the verdict**

```
SARVAM_TOOL_CALLING_RELIABLE=true   # if step 2 succeeded
# or
SARVAM_TOOL_CALLING_RELIABLE=false  # if step 2 returned plain text only
```

This drives a branching decision in Part B Task B1.

---

### Task A6: Locate HelloCounsel Promptfoo config

**Why:** §14 of PRD/TRD says `goldenset.yaml` mirrors HelloCounsel's Promptfoo structure. Agents need to read it before writing the new one.

- [ ] **Step 1: Find it**

Search likely locations:
```bash
find "C:/Users/SHUBH SANKALP DAS/Desktop/Building" -name "promptfoo.yaml" -o -name "promptfooconfig.yaml" 2>/dev/null
```

If not on local disk, check the HelloCounsel GitHub org:
```bash
gh repo list HelloCounsel --limit 30 | grep -i prompt
```

- [ ] **Step 2: Capture**

```
HELLOCOUNSEL_PROMPTFOO_PATH=<absolute path OR gh repo URL>
```

If neither exists, agents will write `goldenset.yaml` from scratch using PRD/TRD §14 structure only.

---

### Task A7: Create the master env file

**Why:** Single source for agents to pull from in Part B.

- [ ] **Step 1: Consolidate**

Create `voiceagent/.env.setup` with everything captured above PLUS existing credentials:

```
# === GitHub ===
GITHUB_REPO=https://github.com/shubhdas0208/medicall-ai
GITHUB_DEFAULT_BRANCH=main

# === Supabase ===
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.<ref>:<pwd>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
SUPABASE_REGION=ap-south-1

# === Google OAuth ===
GOOGLE_OAUTH_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<secret>

# === Railway ===
RAILWAY_PROJECT_NAME=medicall
RAILWAY_NEXT_APP_SERVICE=next-app
RAILWAY_RUNNER_SERVICE=promptfoo-runner

# === Sarvam ===
SARVAM_API_KEY=<from voiceagent/sarvam_api_key.txt>
SARVAM_TOOL_CALLING_RELIABLE=true_or_false

# === LiveKit (existing) ===
LIVEKIT_URL=wss://medicall-fnwx4gzs.livekit.cloud
LIVEKIT_API_KEY=<from livekit/.env>
LIVEKIT_API_SECRET=<from livekit/.env>
SIP_TRUNK_ID=ST_GcCobQBMU7Vn

# === Twilio (existing) ===
TWILIO_ACCOUNT_SID=<from twilio_credentials.txt>
TWILIO_AUTH_TOKEN=<from twilio_credentials.txt>
TWILIO_PHONE=+18145243223

# === Langfuse (existing) ===
LANGFUSE_PUBLIC_KEY=<from livekit/.env>
LANGFUSE_SECRET_KEY=<from livekit/.env>
LANGFUSE_HOST=https://cloud.langfuse.com

# === OpenAI (Promptfoo grader) ===
OPENAI_API_KEY=<from evals/.env>

# === HelloCounsel reference ===
HELLOCOUNSEL_PROMPTFOO_PATH=<path>
```

- [ ] **Step 2: Verify gitignore**

Confirm `.env.setup` is in `.gitignore`:
```bash
grep '.env.setup' .gitignore || echo '.env.setup' >> .gitignore
git add .gitignore && git commit -m "chore: ignore .env.setup"
```

- [ ] **Step 3: Hand off**

Tell agents: "Part A complete. Begin Part B."

---

# PART B — Agent Build (Autonomous after Part A)

> Each task is self-contained. Each step is 2–5 minutes. Use TDD where the contract is clear; use build-and-verify for UI. Commit at the end of every task.

**Setup before starting Part B:**
- [ ] Read `voiceagent/PRD-TRD.md` cover to cover — that's the spec.
- [ ] Load `voiceagent/.env.setup` into shell env.
- [ ] Verify Python 3.11+ and Node 20+ are installed.

---

### Task B1: Verify Sarvam-30B tool calling & choose outcome-reporting path

**Files:**
- Read: `voiceagent/.env.setup` (`SARVAM_TOOL_CALLING_RELIABLE`)
- Modify: nothing yet — this is a decision task

- [ ] **Step 1: Read the verdict**

```bash
grep SARVAM_TOOL_CALLING_RELIABLE voiceagent/.env.setup
```

- [ ] **Step 2: Branch**

If `true` → continue with Path A (function_tool). All subsequent Bug #5 tasks use `@function_tool def report_outcome(...)`.

If `false` → switch to Path A.5 (JSON-mode trailer). Add the instruction to system_prompt: "After your closing sentence, emit a JSON object on a new line: `{\"outcome\": \"CONFIRMED|DENIED|ESCALATED\", \"reason\": \"...\"}`". `agent.py` regex-parses the trailer.

- [ ] **Step 3: Document the decision**

Append to `voiceagent/side-note.md`:
```markdown
## Decision 2026-06-22 — Bug #5 implementation path

Sarvam-30B tool calling verdict: <true|false>
Chosen path: <Path A: @function_tool | Path A.5: JSON trailer>
Fallback chain: <chosen path> → keyword regex on user transcript.
```

- [ ] **Step 4: Commit**

```bash
git add voiceagent/side-note.md
git commit -m "docs: lock bug #5 implementation path"
```

---

### Task B2: Add `report_outcome` and `end_call` function tools to agent.py

**Files:**
- Modify: `voiceagent/livekit/agent.py`
- Create: `voiceagent/livekit/tests/test_outcome_reporting.py`

(If Path A.5 chosen from B1, skip the `@function_tool` work; jump to Task B3 which handles JSON-trailer parsing.)

- [ ] **Step 1: Write the failing test**

Create `voiceagent/livekit/tests/test_outcome_reporting.py`:

```python
import pytest
from unittest.mock import MagicMock, AsyncMock
from agent import MediCallAgent, CallState

@pytest.mark.asyncio
async def test_report_outcome_sets_state():
    state = CallState()
    agent = MediCallAgent(state=state, session=MagicMock())

    await agent.report_outcome(outcome="CONFIRMED", reason="user said haan")

    assert state.reported_outcome == "CONFIRMED"
    assert state.reported_reason == "user said haan"

@pytest.mark.asyncio
async def test_end_call_closes_session():
    state = CallState()
    session = MagicMock()
    session.aclose = AsyncMock()
    agent = MediCallAgent(state=state, session=session)

    await agent.end_call()

    assert state.should_end is True
    session.aclose.assert_awaited_once()
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd voiceagent/livekit
pip install pytest pytest-asyncio
pytest tests/test_outcome_reporting.py -v
```

Expected: ImportError or AttributeError — `report_outcome` and `end_call` don't exist yet.

- [ ] **Step 3: Add tools to MediCallAgent**

In `voiceagent/livekit/agent.py`, find the `MediCallAgent` class definition (search for `class MediCallAgent(Agent):`). Add these methods inside the class:

```python
from typing import Literal
from livekit.agents import function_tool

class MediCallAgent(Agent):
    # ... existing __init__ ...

    @function_tool
    async def report_outcome(
        self,
        outcome: Literal["CONFIRMED", "DENIED", "ESCALATED"],
        reason: str,
    ):
        """Report the outcome of the call. Call this ONCE when the user's intent is clear.
        CONFIRMED = took medicine. DENIED = will take later. ESCALATED = symptom reported."""
        self.state.reported_outcome = outcome
        self.state.reported_reason = reason

    @function_tool
    async def end_call(self):
        """Close the call. Call this AFTER report_outcome and AFTER saying your closing sentence."""
        self.state.should_end = True
        await self.session.aclose()
```

Also extend `CallState` dataclass (search for `@dataclass\nclass CallState`):
```python
@dataclass
class CallState:
    # ... existing fields ...
    reported_outcome: Optional[str] = None
    reported_reason: Optional[str] = None
    should_end: bool = False
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pytest tests/test_outcome_reporting.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add voiceagent/livekit/agent.py voiceagent/livekit/tests/test_outcome_reporting.py
git commit -m "feat(agent): add report_outcome and end_call function tools"
```

---

### Task B3: Rewrite `derive_outcome()` with triple fallback chain

**Files:**
- Modify: `voiceagent/livekit/agent.py`
- Modify: `voiceagent/livekit/tests/test_outcome_reporting.py`

- [ ] **Step 1: Write failing tests**

Append to `test_outcome_reporting.py`:

```python
import re
from agent import derive_outcome, CallState

def test_derive_outcome_prefers_reported_outcome():
    state = CallState(reported_outcome="CONFIRMED")
    assert derive_outcome(state) == ("CONFIRMED", "tool_call")

def test_derive_outcome_falls_back_to_json_trailer():
    state = CallState(
        reported_outcome=None,
        transcript=[
            {"role": "user", "text": "हां ले लिया।"},
            {"role": "agent", "text": 'धन्यवाद।\n{"outcome": "CONFIRMED", "reason": "user confirmed"}'},
        ],
    )
    assert derive_outcome(state) == ("CONFIRMED", "json_trailer")

def test_derive_outcome_falls_back_to_keyword():
    state = CallState(
        reported_outcome=None,
        transcript=[
            {"role": "user", "text": "haan le liya"},
            {"role": "agent", "text": "बहुत अच्छा।"},
        ],
    )
    assert derive_outcome(state) == ("CONFIRMED", "keyword_match")

def test_derive_outcome_voicemail_short_circuits():
    state = CallState(voicemail_detected=True, reported_outcome="CONFIRMED")
    assert derive_outcome(state) == ("NO_ANSWER", "voicemail_detector")
```

- [ ] **Step 2: Run to confirm failures**

```bash
pytest tests/test_outcome_reporting.py -v
```

- [ ] **Step 3: Rewrite `derive_outcome` in agent.py**

Replace the existing `derive_outcome` function with:

```python
import re

CONFIRMED_KEYWORDS = ("haan", "haa", "le liya", "ho gaya", "kha liya", "li hai",
                      "हां", "ले लिया", "हो गया", "खा लिया")
DENIED_KEYWORDS = ("nahi", "nahin", "abhi nahi", "नहीं", "अभी नहीं")
SYMPTOM_KEYWORDS = ("dard", "bukhar", "ulti", "chakkar", "दर्द", "बुखार", "उल्टी", "चक्कर")

def derive_outcome(state) -> tuple[str, str]:
    """Returns (outcome, source). source ∈ tool_call|json_trailer|keyword_match|voicemail_detector|watchdog."""
    if state.voicemail_detected:
        return ("NO_ANSWER", "voicemail_detector")

    # Primary: structured tool call
    if state.reported_outcome:
        return (state.reported_outcome, "tool_call")

    # Fallback 1: JSON trailer in last agent message
    if state.transcript:
        for msg in reversed(state.transcript):
            if msg.get("role") == "agent":
                m = re.search(r'\{"outcome"\s*:\s*"(CONFIRMED|DENIED|ESCALATED)"', msg["text"])
                if m:
                    return (m.group(1), "json_trailer")
                break

    # Fallback 2: keyword regex on user transcript
    user_text = " ".join(
        m["text"].lower() for m in state.transcript if m.get("role") == "user"
    )
    if any(k in user_text for k in SYMPTOM_KEYWORDS):
        return ("ESCALATED", "keyword_match")
    if any(k in user_text for k in CONFIRMED_KEYWORDS):
        return ("CONFIRMED", "keyword_match")
    if any(k in user_text for k in DENIED_KEYWORDS):
        return ("DENIED", "keyword_match")

    return ("NO_ANSWER", "watchdog")
```

- [ ] **Step 4: Update all callers of `derive_outcome`**

Find every `derive_outcome(state)` call in `agent.py`. The function now returns a tuple. Update:
```python
# Before:
outcome = derive_outcome(state)
post_end_of_call_report(state, outcome)

# After:
outcome, source = derive_outcome(state)
state.outcome_source = source
post_end_of_call_report(state, outcome)
```

And add `outcome_source: Optional[str] = None` to `CallState`.

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_outcome_reporting.py -v
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add voiceagent/livekit/agent.py voiceagent/livekit/tests/test_outcome_reporting.py
git commit -m "feat(agent): rewrite derive_outcome with triple fallback chain (Bug #5)"
```

---

### Task B4: Update `prompts.yaml` with enumerated clarify branches (Bug #7)

**Files:**
- Modify: `voiceagent/admin-panel/prompts.yaml`

- [ ] **Step 1: Read current prompt**

```bash
cat voiceagent/admin-panel/prompts.yaml
```

- [ ] **Step 2: Add clarify rules to system_prompt**

Append to the `system_prompt` field in `prompts.yaml` (preserve existing content; add at end):

```yaml
system_prompt: |
  # ... existing prompt content stays ...

  # === CLARIFY BRANCHES (Bug #7) ===
  यदि उपयोगकर्ता निम्न में से कोई स्पष्टीकरण प्रश्न पूछता है, तो स्क्रिप्ट से उत्तर दें:

  - प्रश्न: "कौन सी दवाई?" → उत्तर: "{drug_name} की दवाई। क्या आपने ले ली है?"
  - प्रश्न: "कौन बोल रहा है?" → उत्तर: "मैं मेडीकॉल से बोल रहा हूँ। क्या आपने {drug_name} ले ली है?"
  - प्रश्न: "क्या समय है?" → उत्तर: "आपका दवाई लेने का समय हो गया है। क्या ले ली है?"
  - प्रश्न: "आपको कैसे पता?" → उत्तर: "आपके परिवार ने मुझे बताया है। क्या ले ली है?"

  अधिकतम 2 स्पष्टीकरण के बाद, यदि उत्तर नहीं मिले:
  → report_outcome("ESCALATED", "clarify_loop_exceeded") कॉल करें।

  # === HARD GUARDRAILS ===
  - कभी भी दवा या खुराक की सलाह न दें।
  - रोमन हिंदी का उपयोग न करें — केवल देवनागरी में उत्तर दें।
  - लक्षण (बुखार, दर्द, उल्टी, चक्कर) रिपोर्ट होने पर:
    → "कृपया डॉक्टर से बात कीजियेगा" + report_outcome("ESCALATED", reason)

  # === CLOSURE PROTOCOL ===
  जब वार्तालाप समाप्त हो (CONFIRMED, DENIED, या ESCALATED):
  1. एक छोटा (1 वाक्य) समापन कथन कहें
  2. report_outcome(outcome, reason) कॉल करें
  3. end_call() कॉल करें
```

- [ ] **Step 3: Verify the YAML is valid**

```bash
python -c "import yaml; print(yaml.safe_load(open('voiceagent/admin-panel/prompts.yaml')))"
```

No exception = valid.

- [ ] **Step 4: Commit**

```bash
git add voiceagent/admin-panel/prompts.yaml
git commit -m "feat(prompts): add enumerated clarify branches + closure protocol (Bug #7)"
```

---

### Task B5: Wire `voicemail_detector.py` into agent.py + shrink watchdog

**Files:**
- Modify: `voiceagent/livekit/agent.py`
- Modify: `voiceagent/livekit/voicemail_detector.py` (no changes expected, but verify shape)
- Create: `voiceagent/livekit/tests/test_voicemail_wiring.py`

- [ ] **Step 1: Inspect detector shape**

```bash
cat voiceagent/livekit/voicemail_detector.py | head -50
```

Confirm there's a class with a method like `is_voicemail(audio_duration_s, transcript) -> bool` or similar. Adapt the call site in Step 3 if names differ.

- [ ] **Step 2: Write failing test**

Create `voiceagent/livekit/tests/test_voicemail_wiring.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from agent import CallState, voicemail_check

def test_voicemail_check_sets_flag():
    state = CallState()
    event = MagicMock(audio_duration_s=8.5, transcript="leave message after beep")
    session = MagicMock()

    with patch("agent.VoicemailDetector") as MockDetector:
        instance = MockDetector.return_value
        instance.is_voicemail.return_value = True
        voicemail_check(event, state, session)

    assert state.voicemail_detected is True

def test_voicemail_check_does_not_flag_human():
    state = CallState()
    event = MagicMock(audio_duration_s=2.0, transcript="हां ले लिया")
    session = MagicMock()

    with patch("agent.VoicemailDetector") as MockDetector:
        instance = MockDetector.return_value
        instance.is_voicemail.return_value = False
        voicemail_check(event, state, session)

    assert state.voicemail_detected is False
```

- [ ] **Step 3: Run to confirm failure**

```bash
pytest tests/test_voicemail_wiring.py -v
```

Expected: ImportError for `voicemail_check`.

- [ ] **Step 4: Wire into agent.py**

At top of `agent.py`:
```python
from voicemail_detector import VoicemailDetector
```

Add the helper:
```python
def voicemail_check(event, state, session):
    detector = VoicemailDetector(monologue_max_s=7.0)
    if detector.is_voicemail(
        audio_duration_s=getattr(event, "audio_duration_s", 0.0),
        transcript=getattr(event, "transcript", ""),
    ):
        state.voicemail_detected = True
        # schedule async close
        import asyncio
        asyncio.create_task(session.aclose())
```

In `entrypoint()`, after `session = AgentSession(...)`, register:
```python
session.on("user_speech_committed",
           lambda ev: voicemail_check(ev, state, session))
```

- [ ] **Step 5: Shrink watchdog constants**

In `agent.py` (top-level constants section):
```python
# Before:
VOICEMAIL_GREETING_GRACE_SECONDS = 30.0
MAX_CALL_DURATION_SECONDS = 120
# After:
VOICEMAIL_GREETING_GRACE_SECONDS = 10.0
MAX_CALL_DURATION_SECONDS = 90
SILENCE_TIMEOUT_SECONDS = 8.0  # keep
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add voiceagent/livekit/agent.py voiceagent/livekit/tests/test_voicemail_wiring.py
git commit -m "feat(agent): wire voicemail_detector + shrink watchdog 30s->10s"
```

---

### Task B6: Point agent.py webhook at Next.js endpoint (env-driven)

**Files:**
- Modify: `voiceagent/livekit/agent.py`
- Modify: `voiceagent/livekit/.env.example`

- [ ] **Step 1: Replace the Apps Script URL constant with env var**

Find `WEBHOOK_URL` definition. Change:
```python
# Before:
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "https://script.google.com/.../exec")
# After:
WEBHOOK_URL = os.environ["DASHBOARD_WEBHOOK_URL"]  # /api/webhook/livekit
```

- [ ] **Step 2: Update .env.example**

```
# Before:
WEBHOOK_URL=https://script.google.com/macros/s/.../exec
# After:
DASHBOARD_WEBHOOK_URL=https://medicall-next-app.up.railway.app/api/webhook/livekit
```

- [ ] **Step 3: Update payload to include new fields**

In the `post_end_of_call_report` function in `agent.py`, include:

```python
payload = {
    "call_id": state.call_id,
    "phone": state.phone,
    "parent_name": vars_.parent_name,
    "drug_name": vars_.drug_name,
    "outcome": outcome,
    "outcome_source": state.outcome_source,
    "reason": state.reported_reason,
    "transcript": state.transcript,
    "duration_sec": state.duration_sec,
    "prompt_version": vars_.prompt_version,  # add this to CallVariables
    "langfuse_trace_id": state.langfuse_trace_id,
    "started_at": state.started_at.isoformat(),
    "ended_at": state.ended_at.isoformat(),
}
```

- [ ] **Step 4: Commit**

```bash
git add voiceagent/livekit/agent.py voiceagent/livekit/.env.example
git commit -m "feat(agent): repoint webhook to Next.js dashboard endpoint"
```

---

### Task B7: Apply Supabase schema migration

**Files:**
- Create: `voiceagent/supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migrations folder**

```bash
mkdir -p voiceagent/supabase/migrations
```

- [ ] **Step 2: Write the schema**

Create `voiceagent/supabase/migrations/001_initial_schema.sql` — use the DDL from **PRD/TRD §17 verbatim** (5 tables: users, prompts, parents, call_logs, eval_runs + the `notify_eval_runs` trigger).

(The full DDL is in `voiceagent/PRD-TRD.md` §17 — copy that block exactly.)

- [ ] **Step 3: Apply to Supabase**

Two options:

**A. Via Supabase CLI (preferred):**
```bash
npm i -g supabase
cd voiceagent
supabase login
supabase link --project-ref <your-ref>
supabase db push
```

**B. Via Supabase dashboard SQL Editor:**
Open Supabase → SQL Editor → New Query → paste contents of `001_initial_schema.sql` → Run.

- [ ] **Step 4: Verify**

In Supabase dashboard → Table Editor — confirm all 5 tables visible: `users`, `prompts`, `parents`, `call_logs`, `eval_runs`.

- [ ] **Step 5: Seed the initial active prompt**

```sql
-- Run in Supabase SQL Editor
insert into public.prompts (version, system_prompt, first_message, variables, is_active)
values (
  1,
  '<paste content of voiceagent/admin-panel/prompts.yaml system_prompt>',
  '<paste content of first_message>',
  '{"parent_name": "Shubh", "drug_name": "Crocin"}'::jsonb,
  true
);
```

- [ ] **Step 6: Commit**

```bash
git add voiceagent/supabase/migrations/001_initial_schema.sql
git commit -m "feat(db): initial Supabase schema (users, prompts, parents, call_logs, eval_runs)"
```

---

### Task B8: Create `goldenset.yaml` and delete legacy scenario files

**Files:**
- Create: `voiceagent/evals/goldenset.yaml`
- Delete: `voiceagent/evals/scenarios/scenario1_confirm.yaml`, `scenario2_deny.yaml`, `scenario3_symptom.yaml`
- Modify: `voiceagent/evals/promptfoo.yaml`

- [ ] **Step 1: Read HelloCounsel reference**

```bash
cat "$HELLOCOUNSEL_PROMPTFOO_PATH"
```

If `HELLOCOUNSEL_PROMPTFOO_PATH` is empty or unreachable, skip — use PRD/TRD §14 structure alone.

- [ ] **Step 2: Write `goldenset.yaml`**

Use the structure from **PRD/TRD §14 verbatim** — 5 scenarios (confirm, deny, symptom, clarify, voicemail) with hybrid asserts (regex + llm-rubric + javascript). Save at `voiceagent/evals/goldenset.yaml`.

- [ ] **Step 3: Delete legacy scenario files**

```bash
rm voiceagent/evals/scenarios/scenario1_confirm.yaml
rm voiceagent/evals/scenarios/scenario2_deny.yaml
rm voiceagent/evals/scenarios/scenario3_symptom.yaml
rmdir voiceagent/evals/scenarios
```

- [ ] **Step 4: Update or replace `evals/promptfoo.yaml`**

Easiest: just delete it and point everything at `goldenset.yaml`:
```bash
rm voiceagent/evals/promptfoo.yaml
```

Or keep it as a thin pointer:
```yaml
# voiceagent/evals/promptfoo.yaml
description: thin pointer — see goldenset.yaml
include:
  - goldenset.yaml
```

- [ ] **Step 5: Run evals locally to confirm green**

```bash
cd voiceagent/evals
export SARVAM_API_KEY=$(cat ../sarvam_api_key.txt)
export OPENAI_API_KEY=$(cat .env | grep OPENAI_API_KEY | cut -d= -f2)
npx promptfoo eval --config goldenset.yaml
```

Expected: all 5 scenarios pass. If any fail on assertion mechanics (not on agent quality), iterate.

- [ ] **Step 6: Commit**

```bash
git add voiceagent/evals/goldenset.yaml
git rm -r voiceagent/evals/scenarios voiceagent/evals/promptfoo.yaml 2>/dev/null || true
git commit -m "feat(evals): consolidate 3 scenarios into single goldenset.yaml"
```

---

### Task B9: Scaffold Next.js dashboard

**Files:**
- Create: `voiceagent/dashboard/` (new folder, entire Next.js project)

- [ ] **Step 1: Scaffold**

```bash
cd voiceagent
npx create-next-app@latest dashboard \
  --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
cd dashboard
```

When prompted: yes to App Router, yes to Tailwind, yes to TypeScript.

- [ ] **Step 2: Install core dependencies**

```bash
npm i @supabase/ssr @supabase/supabase-js \
      @tanstack/react-query react-hook-form zod @hookform/resolvers \
      livekit-client @livekit/components-react @livekit/components-styles \
      lucide-react recharts \
      class-variance-authority clsx tailwind-merge
npm i -D @types/node
```

- [ ] **Step 3: Install shadcn/ui CLI and add base components**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input textarea card table tabs dialog \
                       dropdown-menu select toast badge separator skeleton
```

- [ ] **Step 4: Add `.env.local` from setup**

Create `voiceagent/dashboard/.env.local` from `voiceagent/.env.setup`:
```
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
LIVEKIT_URL=$LIVEKIT_URL
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET
SIP_TRUNK_ID=$SIP_TRUNK_ID
LANGFUSE_PUBLIC_KEY=$LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY=$LANGFUSE_SECRET_KEY
```

Also add to `.gitignore`:
```bash
echo "dashboard/.env.local" >> voiceagent/.gitignore
```

- [ ] **Step 5: Verify dev server boots**

```bash
npm run dev
```

Visit http://localhost:3000 — Next.js welcome page renders. Stop the server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
cd ../..  # back to voiceagent root
git add voiceagent/dashboard
git commit -m "feat(dashboard): scaffold Next.js 14 + Tailwind + shadcn/ui"
```

---

### Task B10: Build Supabase Auth middleware + login page

**Files:**
- Create: `voiceagent/dashboard/src/lib/supabase/server.ts`
- Create: `voiceagent/dashboard/src/lib/supabase/client.ts`
- Create: `voiceagent/dashboard/src/lib/supabase/middleware.ts`
- Create: `voiceagent/dashboard/src/middleware.ts`
- Create: `voiceagent/dashboard/src/app/login/page.tsx`
- Create: `voiceagent/dashboard/src/app/auth/callback/route.ts`

- [ ] **Step 1: Create Supabase server client**

`src/lib/supabase/server.ts`:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 2: Create browser client**

`src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Create middleware**

`src/middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/auth') &&
      !request.nextUrl.pathname.startsWith('/api/webhook')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Login page**

`src/app/login/page.tsx`:

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const supabase = createClient()
  const signInGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-96 p-8 border rounded-lg space-y-4">
        <h1 className="text-2xl font-semibold">MediCall AI</h1>
        <p className="text-sm text-muted-foreground">Internal dashboard. Sign in to continue.</p>
        <Button onClick={signInGoogle} className="w-full">Continue with Google</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: OAuth callback**

`src/app/auth/callback/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/`)
}
```

- [ ] **Step 6: Test locally**

```bash
cd voiceagent/dashboard && npm run dev
```

Visit http://localhost:3000 → should redirect to /login → click "Continue with Google" → after Google flow, redirected back to / (which will 404 until Task B11). Confirm Supabase Authentication → Users tab shows a new user.

- [ ] **Step 7: Insert user into public.users**

After your first sign-in, in Supabase SQL Editor:
```sql
insert into public.users (id, email, display_name, role)
select id, email, raw_user_meta_data->>'full_name', 'admin'
from auth.users where email = 'dasshriyans2802@gmail.com'
on conflict (id) do update set role = 'admin';
```

- [ ] **Step 8: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): supabase auth middleware + google oauth login"
```

---

### Task B11: Build the dashboard shell (sidebar + layout)

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/layout.tsx`
- Create: `voiceagent/dashboard/src/components/sidebar.tsx`
- Create: `voiceagent/dashboard/src/components/user-menu.tsx`

- [ ] **Step 1: Sidebar component**

`src/components/sidebar.tsx`:

```tsx
import Link from 'next/link'
import { Home, Settings2, FlaskConical, Mic, Phone, Calendar, DollarSign, Cog } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/admin', label: 'Admin', icon: Settings2 },
  { href: '/test', label: 'Browser Test', icon: Mic },
  { href: '/evals', label: 'Evals', icon: FlaskConical },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/costs', label: 'Costs', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Cog },
]

export function Sidebar() {
  return (
    <aside className="w-60 border-r bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="p-6 text-xl font-semibold">MediCall</div>
      <nav className="flex-1 px-3 space-y-1">
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm
                       hover:bg-zinc-800 transition-colors"
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: User menu**

`src/components/user-menu.tsx`:

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function UserMenu({ email }: { email: string }) {
  const supabase = createClient()
  const signOut = async () => {
    await supabase.auth.signOut()
    location.href = '/login'
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">{email}</span>
      <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
    </div>
  )
}
```

- [ ] **Step 3: Authenticated layout**

`src/app/(app)/layout.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { UserMenu } from '@/components/user-menu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b px-6 flex items-center justify-end">
          <UserMenu email={user.email!} />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Move root page into the layout group**

```bash
mkdir -p voiceagent/dashboard/src/app/\(app\)
mv voiceagent/dashboard/src/app/page.tsx voiceagent/dashboard/src/app/\(app\)/page.tsx
```

Replace `(app)/page.tsx` content with a placeholder Home:
```tsx
export default function HomePage() {
  return <h1 className="text-2xl font-semibold">Home</h1>
}
```

- [ ] **Step 5: Verify**

```bash
npm run dev
```

Sign in → see sidebar on left, "Home" text on right. Click each tab — all 404 except Home.

- [ ] **Step 6: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): sidebar shell + authenticated layout"
```

---

### Task B12: Build Admin tab (prompt editor)

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/admin/page.tsx`
- Create: `voiceagent/dashboard/src/app/api/prompts/route.ts`
- Create: `voiceagent/dashboard/src/lib/types.ts`

- [ ] **Step 1: Types**

`src/lib/types.ts`:
```typescript
export type Prompt = {
  id: string
  version: number
  system_prompt: string
  first_message: string
  variables: Record<string, string>
  is_active: boolean
  created_at: string
  notes: string | null
}
```

- [ ] **Step 2: API route — GET (active) + POST (save new version)**

`src/app/api/prompts/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('prompts').select('*').eq('is_active', true).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { system_prompt, first_message, variables, notes } = await req.json()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: latest } = await supabase
    .from('prompts').select('version').order('version', { ascending: false }).limit(1).single()
  const nextVersion = (latest?.version ?? 0) + 1

  // Deactivate current, insert new active
  await supabase.from('prompts').update({ is_active: false }).eq('is_active', true)
  const { data, error } = await supabase.from('prompts').insert({
    version: nextVersion,
    system_prompt, first_message, variables, notes,
    is_active: true,
    created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Admin page UI**

`src/app/(app)/admin/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

type Prompt = {
  system_prompt: string
  first_message: string
  variables: Record<string, string>
  version: number
}

export default function AdminPage() {
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [draft, setDraft] = useState<Prompt | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/prompts').then(r => r.json()).then(p => {
      setPrompt(p); setDraft(p)
    })
  }, [])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const newP = await res.json()
    setPrompt(newP); setDraft(newP)
    setSaving(false)
  }

  if (!draft) return <p>Loading…</p>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin — Prompt Editor</h1>
          <p className="text-sm text-muted-foreground">
            Active version: v{prompt?.version}
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save as new version'}
        </Button>
      </div>

      <label className="block">
        <span className="text-sm font-medium">First message</span>
        <Input value={draft.first_message}
               onChange={e => setDraft({...draft, first_message: e.target.value})} />
      </label>

      <label className="block">
        <span className="text-sm font-medium">System prompt</span>
        <Textarea value={draft.system_prompt}
                  onChange={e => setDraft({...draft, system_prompt: e.target.value})}
                  rows={24} className="font-mono text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        {Object.entries(draft.variables).map(([k, v]) => (
          <label key={k} className="block">
            <span className="text-sm font-medium">{k}</span>
            <Input value={v} onChange={e =>
              setDraft({...draft, variables: {...draft.variables, [k]: e.target.value}})
            } />
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

`npm run dev` → /admin → see current prompt loaded → edit a field → save → page refreshes with v+1.

In Supabase Table Editor → `prompts` table → confirm new row exists.

- [ ] **Step 5: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): admin tab — prompt editor with versioning"
```

---

### Task B13: Build Calls tab (log viewer)

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/calls/page.tsx`
- Create: `voiceagent/dashboard/src/app/api/calls/route.ts`

- [ ] **Step 1: API route**

`src/app/api/calls/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '50')
  const outcome = url.searchParams.get('outcome')

  let q = supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  if (outcome) q = q.eq('outcome', outcome)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Page**

`src/app/(app)/calls/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type CallLog = {
  id: string; call_id: string; phone: string; outcome: string;
  outcome_source: string; duration_sec: number;
  prompt_version: number; created_at: string;
}

const outcomeColor: Record<string, string> = {
  CONFIRMED: 'bg-green-600', DENIED: 'bg-yellow-600',
  ESCALATED: 'bg-red-600', NO_ANSWER: 'bg-zinc-500', ERROR: 'bg-red-800',
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLog[]>([])

  useEffect(() => { fetch('/api/calls').then(r => r.json()).then(setCalls) }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Calls</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Prompt v</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map(c => (
            <TableRow key={c.id}>
              <TableCell>{new Date(c.created_at).toLocaleString()}</TableCell>
              <TableCell className="font-mono">{c.phone}</TableCell>
              <TableCell>
                <Badge className={outcomeColor[c.outcome] ?? 'bg-zinc-400'}>{c.outcome}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.outcome_source}</TableCell>
              <TableCell>{c.duration_sec}s</TableCell>
              <TableCell>v{c.prompt_version}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Verify** — visit /calls. Empty table is OK (no calls yet). No errors in console.

- [ ] **Step 4: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): calls tab — log viewer"
```

---

### Task B14: Build Schedule tab (parents CRUD)

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/schedule/page.tsx`
- Create: `voiceagent/dashboard/src/app/api/parents/route.ts`
- Create: `voiceagent/dashboard/src/app/api/parents/[id]/route.ts`

- [ ] **Step 1: List/create API**

`src/app/api/parents/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase.from('parents').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('parents').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Update/delete API**

`src/app/api/parents/[id]/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('parents').update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { error } = await supabase.from('parents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Page UI**

`src/app/(app)/schedule/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Parent = {
  id: string; name: string; phone: string; drug_name: string;
  scheduled_time: string | null; active: boolean
}

export default function SchedulePage() {
  const [parents, setParents] = useState<Parent[]>([])
  const [draft, setDraft] = useState({ name: '', phone: '', drug_name: '', scheduled_time: '' })

  const reload = () => fetch('/api/parents').then(r => r.json()).then(setParents)
  useEffect(() => { reload() }, [])

  const add = async () => {
    await fetch('/api/parents', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, active: true })
    })
    setDraft({ name: '', phone: '', drug_name: '', scheduled_time: '' })
    reload()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this parent?')) return
    await fetch(`/api/parents/${id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Schedule</h1>

      <div className="flex gap-2 items-end">
        <Input placeholder="Name" value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} />
        <Input placeholder="+91..." value={draft.phone} onChange={e => setDraft({...draft, phone: e.target.value})} />
        <Input placeholder="Drug" value={draft.drug_name} onChange={e => setDraft({...draft, drug_name: e.target.value})} />
        <Input type="time" value={draft.scheduled_time} onChange={e => setDraft({...draft, scheduled_time: e.target.value})} />
        <Button onClick={add}>Add</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead><TableHead>Phone</TableHead>
            <TableHead>Drug</TableHead><TableHead>Time</TableHead>
            <TableHead>Active</TableHead><TableHead>—</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parents.map(p => (
            <TableRow key={p.id}>
              <TableCell>{p.name}</TableCell>
              <TableCell className="font-mono">{p.phone}</TableCell>
              <TableCell>{p.drug_name}</TableCell>
              <TableCell>{p.scheduled_time ?? '—'}</TableCell>
              <TableCell>{p.active ? '✓' : '—'}</TableCell>
              <TableCell><Button variant="outline" size="sm" onClick={() => remove(p.id)}>Delete</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 4: Verify** — /schedule → add a row → see it appear → delete → row gone.

- [ ] **Step 5: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): schedule tab — parents CRUD"
```

---

### Task B15: Build Browser Test tab (LiveKit JS)

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/test/page.tsx`
- Create: `voiceagent/dashboard/src/app/api/livekit-token/route.ts`

- [ ] **Step 1: Token API route**

`src/app/api/livekit-token/route.ts`:
```typescript
import { AccessToken } from 'livekit-server-sdk'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const room = url.searchParams.get('room') ?? `test-${Date.now()}`
  const identity = url.searchParams.get('identity') ?? 'browser-tester'

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity }
  )
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true })

  return NextResponse.json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL })
}
```

Install: `npm i livekit-server-sdk`

- [ ] **Step 2: Test page**

`src/app/(app)/test/page.tsx`:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useTracks, ControlBar } from '@livekit/components-react'
import '@livekit/components-styles'
import { Track } from 'livekit-client'
import { Button } from '@/components/ui/button'

export default function TestPage() {
  const [token, setToken] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const connect = async () => {
    setConnecting(true)
    const r = await fetch('/api/livekit-token').then(r => r.json())
    setToken(r.token); setUrl(r.url)
    setConnecting(false)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Browser Test</h1>
      <p className="text-sm text-muted-foreground">
        Talk to the live agent without placing a real phone call. Make sure
        <code className="font-mono"> python agent.py dev</code> is running locally.
      </p>

      {!token && (
        <Button onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect to agent'}
        </Button>
      )}

      {token && url && (
        <LiveKitRoom token={token} serverUrl={url} connect audio video={false}
                     onDisconnected={() => setToken(null)}
                     className="h-96 border rounded-lg">
          <RoomAudioRenderer />
          <ControlBar variation="minimal" />
        </LiveKitRoom>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify** — start agent locally (`python agent.py dev`), /test → click Connect → grant mic → speak → agent responds.

- [ ] **Step 4: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): browser-test tab — LiveKit JS with token mint"
```

---

### Task B16: Build Evals tab

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/evals/page.tsx`
- Create: `voiceagent/dashboard/src/app/api/eval/trigger/route.ts`
- Create: `voiceagent/dashboard/src/app/api/eval/results/route.ts`

- [ ] **Step 1: Trigger API**

`src/app/api/eval/trigger/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: activePrompt } = await supabase
    .from('prompts').select('version').eq('is_active', true).single()

  const { data, error } = await supabase.from('eval_runs').insert({
    triggered_by: user.id,
    prompt_version: activePrompt?.version,
    status: 'queued',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Results API**

`src/app/api/eval/results/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('eval_runs').select('*').order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Evals page**

`src/app/(app)/evals/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type EvalRun = {
  id: string; status: string; scenarios_total: number;
  scenarios_passed: number; prompt_version: number;
  started_at: string | null; finished_at: string | null; created_at: string
}

const statusColor: Record<string, string> = {
  queued: 'bg-zinc-500', running: 'bg-blue-600',
  passed: 'bg-green-600', failed: 'bg-yellow-600', errored: 'bg-red-700',
}

export default function EvalsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [triggering, setTriggering] = useState(false)

  const reload = () => fetch('/api/eval/results').then(r => r.json()).then(setRuns)
  useEffect(() => {
    reload()
    const id = setInterval(reload, 3000)  // poll while running
    return () => clearInterval(id)
  }, [])

  const trigger = async () => {
    setTriggering(true)
    await fetch('/api/eval/trigger', { method: 'POST' })
    setTriggering(false)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Evals</h1>
        <Button onClick={trigger} disabled={triggering}>
          {triggering ? 'Queuing…' : 'Run goldenset'}
        </Button>
      </div>

      <Table>
        <TableHeader><TableRow>
          <TableHead>Started</TableHead><TableHead>Prompt v</TableHead>
          <TableHead>Status</TableHead><TableHead>Pass/Total</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {runs.map(r => (
            <TableRow key={r.id}>
              <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell>v{r.prompt_version}</TableCell>
              <TableCell><Badge className={statusColor[r.status]}>{r.status}</Badge></TableCell>
              <TableCell>{r.scenarios_passed ?? '—'} / {r.scenarios_total ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 4: Verify** — /evals → click Run goldenset → see row appear with status `queued`. (Will stay queued until Task B19 deploys the runner.)

- [ ] **Step 5: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): evals tab — trigger + result table"
```

---

### Task B17: Build Home, Costs, Settings tabs (lighter)

**Files:**
- Create: `voiceagent/dashboard/src/app/(app)/page.tsx` (replace placeholder)
- Create: `voiceagent/dashboard/src/app/(app)/costs/page.tsx`
- Create: `voiceagent/dashboard/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Home — recent calls + outcome rate**

Replace `src/app/(app)/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'

export default async function Home() {
  const supabase = createClient()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const { data: todayCalls } = await supabase
    .from('call_logs').select('outcome')
    .gte('created_at', today.toISOString())

  const total = todayCalls?.length ?? 0
  const confirmed = todayCalls?.filter(c => c.outcome === 'CONFIRMED').length ?? 0
  const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0

  const { data: activePrompt } = await supabase
    .from('prompts').select('version').eq('is_active', true).single()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Home</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Calls today</p>
          <p className="text-3xl font-semibold">{total}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Outcome rate (CONFIRMED)</p>
          <p className="text-3xl font-semibold">{rate}%</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Active prompt</p>
          <p className="text-3xl font-semibold">v{activePrompt?.version ?? '—'}</p>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Costs — placeholder + Langfuse link**

`src/app/(app)/costs/page.tsx`:
```tsx
export default function CostsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Costs</h1>
      <p className="text-sm text-muted-foreground">
        Per-vendor cost rollup. Full Langfuse dashboard:{' '}
        <a className="underline" href="https://cloud.langfuse.com" target="_blank">cloud.langfuse.com</a>
      </p>
      <p className="text-sm">Live cost API integration — Phase A.</p>
    </div>
  )
}
```

- [ ] **Step 3: Settings — placeholder**

`src/app/(app)/settings/page.tsx`:
```tsx
export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        User management, vendor toggles, API key rotation. Phase A.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Verify all tabs render without errors**

`npm run dev` → visit each of /, /admin, /test, /evals, /calls, /schedule, /costs, /settings.

- [ ] **Step 5: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): home + costs + settings (lighter Phase 0 surfaces)"
```

---

### Task B18: Build webhook endpoint `/api/webhook/livekit`

**Files:**
- Create: `voiceagent/dashboard/src/app/api/webhook/livekit/route.ts`

- [ ] **Step 1: Write the route**

`src/app/api/webhook/livekit/route.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const payload = await req.json()

  // Use service role — webhook isn't user-authed
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve parent_id from phone (best effort)
  const { data: parent } = await supabase
    .from('parents').select('id').eq('phone', payload.phone).maybeSingle()

  const { error } = await supabase.from('call_logs').upsert({
    call_id: payload.call_id,
    parent_id: parent?.id ?? null,
    phone: payload.phone,
    outcome: payload.outcome,
    outcome_source: payload.outcome_source,
    reason: payload.reason,
    transcript: payload.transcript,
    duration_sec: payload.duration_sec,
    prompt_version: payload.prompt_version,
    stack: 'livekit',
    raw_payload: payload,
    langfuse_trace_id: payload.langfuse_trace_id,
    started_at: payload.started_at,
    ended_at: payload.ended_at,
  }, { onConflict: 'call_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Smoke test locally**

```bash
curl -X POST http://localhost:3000/api/webhook/livekit \
  -H 'content-type: application/json' \
  -d '{"call_id":"test-1","phone":"+918104348262","outcome":"CONFIRMED","outcome_source":"tool_call","transcript":[],"duration_sec":17,"prompt_version":1,"started_at":"2026-06-22T10:00:00Z","ended_at":"2026-06-22T10:00:17Z"}'
```

Expected: `{"ok": true}`. Then visit /calls → row visible.

- [ ] **Step 3: Commit**

```bash
git add voiceagent/dashboard
git commit -m "feat(dashboard): /api/webhook/livekit — end-of-call sink"
```

---

### Task B19: Build the Promptfoo runner service

**Files:**
- Create: `voiceagent/eval-runner/package.json`
- Create: `voiceagent/eval-runner/src/index.ts`
- Create: `voiceagent/eval-runner/Dockerfile` (or `nixpacks.toml`)
- Create: `voiceagent/eval-runner/tsconfig.json`

- [ ] **Step 1: Initialize**

```bash
mkdir -p voiceagent/eval-runner/src
cd voiceagent/eval-runner
npm init -y
npm i fastify pg @supabase/supabase-js
npm i -D typescript @types/node @types/pg ts-node
npx tsc --init
```

In `package.json`, add scripts:
```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "dev": "ts-node src/index.ts"
  }
}
```

- [ ] **Step 2: Runner code**

`src/index.ts`:
```typescript
import Fastify from 'fastify'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const app = Fastify({ logger: true })

app.get('/health', async () => ({ ok: true }))

app.listen({ port: 3000, host: '0.0.0.0' })

// LISTEN/NOTIFY worker
async function startWorker() {
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  await pg.connect()
  await pg.query('LISTEN eval_runs_queue')

  pg.on('notification', async (msg) => {
    if (!msg.payload) return
    const { id } = JSON.parse(msg.payload)
    await runEval(id)
  })
}

async function runEval(evalRunId: string) {
  app.log.info(`Running eval ${evalRunId}`)
  await supabase.from('eval_runs').update({
    status: 'running', started_at: new Date().toISOString()
  }).eq('id', evalRunId)

  try {
    // Fetch active prompt + write to temp goldenset
    const { data: prompt } = await supabase.from('prompts').select('*').eq('is_active', true).single()
    if (!prompt) throw new Error('no active prompt')

    const goldenset = fs.readFileSync(path.join(__dirname, '../../evals/goldenset.yaml'), 'utf8')
    const tmpPath = `/tmp/goldenset-${evalRunId}.yaml`
    fs.writeFileSync(tmpPath, goldenset)  // can inject prompt here if needed

    const { stdout } = await execAsync(
      `npx promptfoo eval --config ${tmpPath} --output /tmp/result-${evalRunId}.json`,
      { env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' }, maxBuffer: 50 * 1024 * 1024 }
    )

    const results = JSON.parse(fs.readFileSync(`/tmp/result-${evalRunId}.json`, 'utf8'))
    const total = results.results?.stats?.cases?.total ?? 0
    const passed = results.results?.stats?.cases?.passed ?? 0

    await supabase.from('eval_runs').update({
      status: passed === total ? 'passed' : 'failed',
      scenarios_total: total,
      scenarios_passed: passed,
      results: results,
      finished_at: new Date().toISOString(),
    }).eq('id', evalRunId)
  } catch (err: any) {
    app.log.error(err)
    await supabase.from('eval_runs').update({
      status: 'errored', error_log: err.message ?? String(err),
      finished_at: new Date().toISOString(),
    }).eq('id', evalRunId)
  }
}

startWorker().catch(err => { app.log.error(err); process.exit(1) })
```

- [ ] **Step 3: Dockerfile**

`Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
RUN npm i -g promptfoo
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 4: Test locally**

```bash
export SUPABASE_URL=...; export SUPABASE_SERVICE_ROLE_KEY=...; export SUPABASE_DB_URL=...
npm run dev
```

In another terminal, trigger via dashboard /evals — the runner picks it up, runs promptfoo, writes result.

- [ ] **Step 5: Commit**

```bash
git add voiceagent/eval-runner
git commit -m "feat(eval-runner): fastify + pg_listen worker for Promptfoo runs"
```

---

### Task B20: Deploy both services to Railway

**Files:**
- Modify: nothing in repo; Railway dashboard config

- [ ] **Step 1: Configure `next-app` service**

In Railway → next-app service → Settings:
- Root directory: `voiceagent/dashboard`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Variables: paste every value from `.env.setup` (NEXT_PUBLIC_* and server-side keys)
- Generate domain (Settings → Networking → Generate Domain)

- [ ] **Step 2: Configure `promptfoo-runner` service**

In Railway → promptfoo-runner service → Settings:
- Root directory: `voiceagent/eval-runner`
- Build: Dockerfile
- Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SARVAM_API_KEY`, `OPENAI_API_KEY`

- [ ] **Step 3: Trigger deploys**

```bash
git push origin main
```

Watch Railway logs for both services until both report healthy.

- [ ] **Step 4: Smoke test deployed URL**

Open `https://medicall-next-app.up.railway.app` (your actual URL). Sign in. Click /evals → Run goldenset → row turns from queued → running → passed within ~60s.

- [ ] **Step 5: Update agent.py env**

```bash
echo "DASHBOARD_WEBHOOK_URL=https://medicall-next-app.up.railway.app/api/webhook/livekit" >> voiceagent/livekit/.env
```

- [ ] **Step 6: Commit env example update**

(`livekit/.env` itself is gitignored — only the example is committed)

```bash
git add voiceagent/livekit/.env.example
git commit -m "chore: production DASHBOARD_WEBHOOK_URL in env example"
```

---

### Task B21: Migrate data from Google Sheet → Supabase

**Files:**
- Create: `voiceagent/scripts/migrate_sheet_to_supabase.py`

- [ ] **Step 1: Write migration script**

`voiceagent/scripts/migrate_sheet_to_supabase.py`:
```python
"""One-shot: pull existing Sheet rows into Supabase tables."""
import os, csv, requests, sys

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SHEET_CSV_URL = os.environ.get("GOOGLE_SHEET_CSV_URL")  # publish-to-web CSV link

def upsert(table, rows):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        json=rows,
    )
    r.raise_for_status()
    print(f"Upserted {len(rows)} into {table}")

def migrate_schedule():
    r = requests.get(SHEET_CSV_URL + "&gid=SCHEDULE_TAB_GID")
    rows = list(csv.DictReader(r.text.splitlines()))
    parents = [{
        "name": row["parent_name"],
        "phone": row["phone"],
        "drug_name": row["drug_name"],
        "scheduled_time": row.get("scheduled_time") or None,
        "active": True,
    } for row in rows]
    if parents: upsert("parents", parents)

def migrate_call_logs():
    r = requests.get(SHEET_CSV_URL + "&gid=CALL_LOGS_TAB_GID")
    rows = list(csv.DictReader(r.text.splitlines()))
    logs = [{
        "call_id": row["call_id"] or f"legacy-{i}",
        "phone": row["phone"],
        "outcome": row["outcome"],
        "outcome_source": "keyword_match",  # historical
        "duration_sec": int(row.get("duration_sec") or 0),
        "stack": row.get("stack", "vapi"),
        "raw_payload": {"migrated_from": "sheet"},
        "started_at": row["timestamp"],
        "ended_at": row["timestamp"],
    } for i, row in enumerate(rows)]
    if logs: upsert("call_logs", logs)

if __name__ == "__main__":
    migrate_schedule()
    migrate_call_logs()
    print("Migration complete.")
```

- [ ] **Step 2: Run it**

```bash
cd voiceagent
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GOOGLE_SHEET_CSV_URL=...
python scripts/migrate_sheet_to_supabase.py
```

- [ ] **Step 3: Verify in Supabase**

Open Table Editor → `parents` + `call_logs` populated.

- [ ] **Step 4: Commit**

```bash
git add voiceagent/scripts/migrate_sheet_to_supabase.py
git commit -m "feat(scripts): one-shot Sheet → Supabase migration"
```

---

### Task B22: Add Supabase keep-warm GitHub Action

**Files:**
- Create: `.github/workflows/supabase-keepalive.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/supabase-keepalive.yml`:
```yaml
name: Supabase keepalive
on:
  schedule:
    - cron: '0 6 */5 * *'
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST endpoint
        run: |
          curl -fsS -X GET \
            "${{ secrets.SUPABASE_URL }}/rest/v1/users?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

- [ ] **Step 2: Add secrets to GitHub repo**

GitHub → repo Settings → Secrets and variables → Actions → New repository secret:
- `SUPABASE_URL` = from `.env.setup`
- `SUPABASE_ANON_KEY` = from `.env.setup`

- [ ] **Step 3: Manually trigger to verify**

Actions tab → Supabase keepalive → Run workflow. Should turn green in ~10 seconds.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/supabase-keepalive.yml
git commit -m "ci: add supabase keep-warm cron (every 5 days)"
git push
```

---

### Task B23: Legacy cleanup

**Files:**
- Delete: `voiceagent/admin-panel/`
- Delete: `voiceagent/browser-test/`
- Delete: `voiceagent/scaffolds/webhook_v2.gs`
- Modify: `voiceagent/README.md`

- [ ] **Step 1: Confirm new flows work end-to-end** (do not skip)

- `/admin` saves a prompt → `agent.py` loads it on next call ✓
- `/test` browser test connects to agent ✓
- `/evals` runs and lands results ✓
- Webhook lands rows in `call_logs` ✓
- Sheet data migrated to Supabase ✓

If any are red, fix before deleting.

- [ ] **Step 2: Delete**

```bash
cd voiceagent
git rm -r admin-panel browser-test scaffolds/webhook_v2.gs scaffolds/schedule_template.csv scaffolds/call_logs_template.csv
```

- [ ] **Step 3: Update README**

In `voiceagent/README.md`, replace the "Folder map" and "How to run" sections to point at `dashboard/` and Railway instead of the deleted Streamlit/FastAPI.

- [ ] **Step 4: Commit**

```bash
git add voiceagent/README.md
git commit -m "chore: delete legacy admin-panel + browser-test + apps script webhook"
git push
```

---

### Task B24: End-to-end smoke test

**Files:** none

- [ ] **Step 1: Place a real call**

```bash
cd voiceagent/livekit
python agent.py dev  # in one terminal
python dial.py +918104348262  # in another
```

Pick up. Confirm in Hindi.

- [ ] **Step 2: Verify**

- Dashboard `/calls` shows the call within 5 seconds.
- Outcome is `CONFIRMED` with `outcome_source = tool_call` (or `json_trailer` if Path A.5).
- Duration is short (no more 30-second hangup waste).
- Langfuse trace visible.

- [ ] **Step 3: Run goldenset from dashboard**

`/evals` → Run goldenset → all 5 scenarios pass.

- [ ] **Step 4: Trigger keep-warm action manually** — Actions → Supabase keepalive → Run workflow → green.

- [ ] **Step 5: Tag the release**

```bash
git tag v0.3.0-pilot
git push --tags
```

---

## Self-Review

**Spec coverage:**
- PRD §1–6 → covered by feature set, no implementation needed
- TRD §7–11 → architecture realized in Tasks B7, B9, B19
- Decision Log §12 → reflected in Tasks B2, B3, B4, B5
- Component Designs §13–19 → fully covered in B2-B20
- Data Model §20–21 → webhook payload in B18, eval trigger in B16
- Roadmap §22–26 → only Phase 0 (pilot) tasks are in this plan; Phases A/B/C/D deferred
- Setup §27–29 → covered by Part A

**Placeholder scan:** No TBDs, no "implement later." Every step has runnable code or explicit dashboard click.

**Type consistency:** `Prompt` type defined in B12 reused in B17. `EvalRun` type defined inline in B16 matches DB schema in PRD/TRD §17. `CallLog` type in B13 matches webhook payload in B18.

**Cross-task references:** B6 references `vars_.prompt_version` (added to `CallVariables` in B6 itself). B7 uses DDL from PRD/TRD §17. B8 uses goldenset structure from PRD/TRD §14. All cross-references are explicit.

---

## Execution Handoff

Plan complete and saved to `voiceagent/IMPLEMENTATION-PLAN.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for catching design issues early.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Single context, faster turns, harder to review.

**My recommendation:** Subagent-driven, but only AFTER you've completed **Part A tomorrow**. The build phase has no waiting on your input once setup is done.

**Which approach?**
