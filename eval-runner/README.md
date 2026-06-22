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
# Fill in values from voiceagent/supabase_credentials.txt
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

Railway picks up the Dockerfile. Set env vars from `.env.example`. **Use the direct Postgres URL (port 5432), not the pooler (6543)** — `LISTEN` requires a persistent session and the transaction-mode pooler will not keep it alive.

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
