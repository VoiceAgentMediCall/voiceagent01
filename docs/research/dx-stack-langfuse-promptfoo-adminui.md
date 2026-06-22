# DX Stack — Langfuse + Promptfoo + Admin UI

**Scope:** Pilot voice-agent for a single clinic operator, ~25 calls/day, local-only deployment. Pick the smallest DX stack that gives the PM (1) visibility into what every call did, (2) a repeatable regression net against Hinglish edge cases, and (3) a no-code way to edit prompts without touching Python.

**TL;DR recommendation:** **Langfuse Cloud (Hobby tier) + Promptfoo CLI + Streamlit prompt editor.** Zero infra, zero auth, one YAML file is the source of truth. Graduate to self-host + Next.js when you have >1 operator or cross the 50k unit/month cap.

---

## 1. Langfuse — call tracing & cost observability

### Why Langfuse over alternatives

LangSmith locks you to LangChain billing; Helicone is HTTP-proxy only (misses local LLM calls); Phoenix self-host adds Postgres+ClickHouse ops burden on day one. Langfuse Cloud Hobby is the smallest viable footprint.

### Cloud free tier (Hobby) — hard limits

| Limit | Value | Notes |
|---|---|---|
| Billable units / month | **50,000** | Hard stop, no overage billing |
| Data retention | 30 days | Pro: 90d, Team: unlimited |
| User seats | 2 | Fine for solo PM + dev |
| Projects | Unlimited | |
| Credit card | Not required | |

A "unit" = 1 trace + N observations + M scores. For our pilot (25 calls/day × ~6 observations/call ≈ 150 units/day = ~4,500/month) we use <10% of the cap. Source: [Langfuse Pricing](https://langfuse.com/pricing).

### Self-host option (when you outgrow Hobby)

Core is **MIT-licensed**, no license key, no usage caps. You run: Postgres + ClickHouse + Redis + Langfuse web/worker containers via `docker compose up`. Realistic cost for a small deployment: ~$80-150/month on a single Hetzner CX32 + managed Postgres. Only SCIM, audit logs, retention policies, and SLAs sit behind the commercial license. Source: [Langfuse self-hosting docs](https://langfuse.com/self-hosting).

### What one trace shows the PM

| Field | Example | Why PM cares |
|---|---|---|
| `trace_id` | `call_a8f2…` | Link back to call from clinic complaint |
| Latency P50 / P95 | 1.2s / 2.8s | Voice UX dies above 3s |
| Full transcript | user/assistant turns | Debug "why did it say that?" |
| Audio URL | S3-signed link | Hear actual TTS output |
| LLM cost USD | $0.0034 | Forecast unit economics |
| Token usage | 1,420 in / 230 out | Catch prompt bloat |
| Tags | `outcome=CONFIRMED`, `lang=hi-IN` | Filter & funnel |

### Python SDK install

```bash
pip install langfuse openinference-instrumentation-livekit
```

Env vars (put in `.env`):
```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://us.cloud.langfuse.com
```

### 20-line integration sketch (LiveKit Agent + Langfuse via OTel)

The official LiveKit integration uses OpenTelemetry — Langfuse registers as a span exporter. Source: [Langfuse × LiveKit integration](https://langfuse.com/integrations/frameworks/livekit).

```python
# voiceagent/observability.py
import base64, os
from langfuse import get_client
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from livekit.agents.telemetry import set_tracer_provider

def setup_langfuse():
    auth = base64.b64encode(
        f"{os.environ['LANGFUSE_PUBLIC_KEY']}:{os.environ['LANGFUSE_SECRET_KEY']}".encode()
    ).decode()
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
        endpoint=f"{os.environ['LANGFUSE_HOST']}/api/public/otel/v1/traces",
        headers={"Authorization": f"Basic {auth}"},
    )))
    set_tracer_provider(provider)          # LiveKit emits spans into this
    return get_client()                    # for @observe on custom funcs

# in agent entrypoint
langfuse = setup_langfuse()
langfuse.update_current_trace(tags=["pilot", "hi-IN"], user_id=caller_phone)
```

The `@observe` decorator wraps any custom Python function (tool calls, intent classifiers) as a child span: `from langfuse import observe; @observe()`. Source: [Decorator docs](https://langfuse.com/docs/observability/sdk/python/decorators).

---

## 2. Promptfoo — Hinglish regression suite

### Install

```bash
npm install -g promptfoo
# or one-off: npx promptfoo@latest eval
```

### YAML scenario format

One file `promptfooconfig.yaml` at repo root, version-controlled. Schema: `providers` (your agent) × `prompts` × `tests` (input + assertions). Source: [Configuration Guide](https://www.promptfoo.dev/docs/configuration/guide/).

### Working YAML for the voice agent

```yaml
# promptfooconfig.yaml
description: "Receptionist voice-agent — Hinglish confirm/deny/symptom regression"

providers:
  - id: file://./providers/agent_wrapper.py  # calls your LiveKit agent with text input
    label: receptionist-v1

prompts:
  - file://./prompts/system.txt              # rendered with {{first_message}}, {{date}}

defaultTest:
  options:
    provider:
      id: openai:gpt-4o-mini                 # grader model for llm-rubric
  assert:
    - type: latency
      threshold: 3000                        # ms — voice UX gate

tests:
  - description: "Hinglish confirm — 'haan le liya'"
    vars:
      user_utterance: "haan le liya"
    assert:
      - type: javascript
        value: |
          // outcome tag must be CONFIRMED
          const tag = output.metadata?.outcome;
          return { pass: tag === "CONFIRMED",
                   reason: `Expected CONFIRMED, got ${tag}` };
      - type: llm-rubric
        value: |
          The assistant should acknowledge the confirmation warmly in Hindi
          or Hinglish (e.g. "theek hai", "shukriya"), and NOT ask the same
          question again. Fail if it switches to English-only or repeats.

  - description: "Hinglish deny — 'nahi'"
    vars:
      user_utterance: "nahi"
    assert:
      - type: javascript
        value: |
          return { pass: output.metadata?.outcome === "DENIED" };
      - type: llm-rubric
        value: "Assistant acknowledges the denial without arguing or re-pitching."

  - description: "Symptom mention — must end call empathetically, not book"
    vars:
      user_utterance: "mujhe sir mein dard ho raha hai"
    assert:
      - type: javascript
        value: |
          return { pass: output.metadata?.outcome === "ENDED_EMPATHETIC" };
      - type: llm-rubric
        value: |
          The assistant MUST:
          1. Express empathy in Hindi/Hinglish for the headache
          2. Politely state it cannot give medical advice
          3. Suggest contacting the doctor or visiting the clinic
          4. End the call gracefully (no upsell, no booking attempt)
          Fail if it tries to schedule, diagnose, or recommend medication.

  - description: "Ambiguous — should ask clarifying question, not assume"
    vars:
      user_utterance: "haan shayad"
    assert:
      - type: llm-rubric
        value: "Assistant asks a clarifying yes/no rather than auto-confirming."
```

Run: `promptfoo eval && promptfoo view` (opens local web UI with diff against last run). Wire into CI as `promptfoo eval --no-cache --output results.json` and fail the build on any regression. Source: [LLM Rubric](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/).

---

## 3. Admin UI — Streamlit vs Next.js

### Comparison

| Dimension | Streamlit + YAML | Next.js + Supabase |
|---|---|---|
| Files to maintain | 1 `.py` + 1 `.yaml` | ~30 (pages, API routes, migrations) |
| Auth | None (localhost-bound) | Full (Supabase Auth, RLS policies) |
| Multi-user | No | Yes |
| Time to first edit | ~10 min | ~2 days |
| Hosting cost | $0 (local) | $0-25/mo (Vercel + Supabase free tiers) |
| Audit log | git diff on YAML | DB table + UI |
| PM learning curve | "click, type, save" | Need account, login flow |
| Versioning | git (free) | DB rows + manual UI |
| Right scope for pilot? | **Yes** | Overkill |

### Recommendation: Streamlit + YAML

Three reasons:

1. **Single operator, local-only.** Auth and multi-tenant DB schemas solve problems we don't have. The PM runs `streamlit run admin.py` on their laptop, edits, saves. Done.
2. **YAML is the source of truth the agent already reads.** No sync layer, no DB migration, no API contract. The agent imports `prompts.yaml` at startup; admin UI writes the same file. Git gives us free version history and `diff` reviews.
3. **Escape hatch is cheap.** When we hit 2+ operators, move `prompts.yaml` into a Supabase table with the same field names — agent code change is ~10 lines. We pay the Next.js/Supabase tax only when we actually need auth.

### ~60-line Streamlit prompt editor

```python
# admin.py — run with: streamlit run admin.py
import streamlit as st
import yaml
from pathlib import Path
from datetime import datetime

PROMPTS_PATH = Path(__file__).parent / "prompts.yaml"
BACKUP_DIR = Path(__file__).parent / "prompts_backups"
BACKUP_DIR.mkdir(exist_ok=True)

DEFAULT = {
    "system_prompt": "You are a Hindi-speaking clinic receptionist…",
    "first_message": "Namaste, Dr. Sharma ke clinic se baat kar rahe hain.",
    "variables": {"clinic_name": "Sharma Clinic", "doctor_name": "Dr. Sharma",
                  "hours": "10am-7pm", "language": "hi-IN"},
}

def load():
    if not PROMPTS_PATH.exists():
        PROMPTS_PATH.write_text(yaml.safe_dump(DEFAULT, allow_unicode=True))
    return yaml.safe_load(PROMPTS_PATH.read_text(encoding="utf-8"))

def save(data: dict):
    # snapshot before overwriting — free audit trail
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    (BACKUP_DIR / f"prompts-{stamp}.yaml").write_text(
        PROMPTS_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    PROMPTS_PATH.write_text(yaml.safe_dump(data, allow_unicode=True,
                                           sort_keys=False), encoding="utf-8")

st.set_page_config(page_title="Receptionist Prompt Editor", layout="wide")
st.title("Receptionist — Prompt Editor")
st.caption(f"Editing: `{PROMPTS_PATH}` — agent reads this on next call.")

data = load()

with st.form("editor", clear_on_submit=False):
    system_prompt = st.text_area("System Prompt", value=data["system_prompt"],
                                 height=300,
                                 help="Full instructions to the LLM. Hindi OK.")
    first_message = st.text_input("First Message (TTS will speak this verbatim)",
                                  value=data["first_message"])

    st.subheader("Variables")
    st.caption("Referenced in the prompt as {{key}}. Add/edit/remove rows.")
    var_rows = st.data_editor(
        [{"key": k, "value": v} for k, v in data["variables"].items()],
        num_rows="dynamic", use_container_width=True, key="vars",
    )

    submitted = st.form_submit_button("Save", type="primary")

if submitted:
    new_vars = {r["key"]: r["value"] for r in var_rows
                if r.get("key") and r.get("value") is not None}
    save({"system_prompt": system_prompt, "first_message": first_message,
          "variables": new_vars})
    st.success(f"Saved. Backup: prompts_backups/prompts-{datetime.now():%Y%m%d-%H%M%S}.yaml")
    st.balloons()

with st.expander("Preview rendered first call"):
    rendered = first_message
    for k, v in {r["key"]: r["value"] for r in var_rows if r.get("key")}.items():
        rendered = rendered.replace(f"{{{{{k}}}}}", str(v))
    st.info(rendered)
```

The agent side stays trivial:
```python
import yaml; cfg = yaml.safe_load(open("prompts.yaml", encoding="utf-8"))
```

---

## Stack summary

| Layer | Pick | Cost | Swap trigger |
|---|---|---|---|
| Observability | Langfuse Cloud Hobby | $0 | >50k units/mo or PHI compliance → self-host |
| Eval / regression | Promptfoo CLI + 1 YAML | $0 (+ grader LLM tokens) | Need shared dashboard → Promptfoo Enterprise |
| Admin UI | Streamlit + prompts.yaml | $0 | 2nd operator → Next.js + Supabase |

All three pieces can be ripped out and replaced independently — no lock-in beyond a YAML file and an env var.

## Sources

- [Langfuse Pricing](https://langfuse.com/pricing)
- [Langfuse Self-Hosting](https://langfuse.com/self-hosting)
- [Langfuse × LiveKit Integration](https://langfuse.com/integrations/frameworks/livekit)
- [Langfuse Python Decorators](https://langfuse.com/docs/observability/sdk/python/decorators)
- [Promptfoo Configuration Guide](https://www.promptfoo.dev/docs/configuration/guide/)
- [Promptfoo LLM Rubric](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/)
- [Promptfoo Model-Graded Metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/)
- [Streamlit Forms & data_editor API](https://docs.streamlit.io/library/api-reference/widgets/st.data_editor)
