# MediCall Eval Runner

Fastify worker that listens on the `eval_runs_queue` Postgres channel and runs the goldenset against the live active prompt.

## How it works

1. Dashboard inserts a row into `eval_runs` with `status='queued'`
2. A Postgres trigger fires `pg_notify('eval_runs_queue', json_build_object('id', NEW.id)::text)`
3. This worker is `LISTEN`-ing on that channel and picks up the notification
4. It pulls the active prompt from `prompts` (where `is_active = true`), loads `../evals/goldenset.yaml`, swaps in the live prompt, runs Promptfoo
5. It normalizes the Promptfoo output and writes back: `status`, `scenarios_total`, `scenarios_passed`, `results`, `started_at`, `finished_at`

## Local dev

```bash
cp .env.example .env
# Fill in eval-runner-specific values here, plus the shared Supabase/Groq
# credentials in the repo-root .env (copy from repo-root .env.example) —
# see CLAUDE.md § Environment variables for the full split.
set -a && source ../.env && source .env && set +a   # this service doesn't self-load dotenv
npm i
npm run dev
```

## Triggering a run

Either:
- Insert a row into Supabase `eval_runs` with `status='queued'` (the trigger fires NOTIFY) — done via the dashboard /evals Run button
- Or hit `POST /run/:id` directly for a known `eval_runs` row id

## Health

`GET /health` returns `{ ok: true, ts: ... }`.

## Deploy

Railway picks up the Dockerfile. Set env vars from `.env.example` (this file) and the repo-root `.env.example`. **Use the Session Pooler connection string** (`aws-0-<region>.pooler.supabase.com:5432`), not the Transaction pooler (port 6543) — transaction-mode pooling rotates the backend connection per transaction and breaks `LISTEN`, which needs one persistent session. Also avoid the "Direct connection" string (`db.<ref>.supabase.co`) if possible — it's IPv6-only on many networks and may not resolve at all; Session Pooler gives the same persistent-session guarantee over IPv4.

## Normalized result shape

```typescript
type EvalScenarioResult = {
  description: string
  passed: boolean
  assertions: { type: string; passed: boolean; reason?: string }[]
}
// Stored in eval_runs.results as: { scenarios: EvalScenarioResult[] }
```

The normalizer is defensive — Promptfoo's JSON shape varies between versions, so it falls back across multiple field paths.
