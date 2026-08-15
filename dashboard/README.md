# MediCall AI — Operator Dashboard

Next.js 16 (App Router) operator dashboard for the MediCall AI voice agent. Read **`AGENTS.md`** in this folder before modifying anything — this Next.js version has breaking API changes from what most training data assumes.

For the full architecture (how this fits with `livekit/`, `eval-runner/`, and Supabase), see the repo root's `CLAUDE.md`.

## Setup

```bash
npm install
cp .env.local.example .env.local          # fill in the Supabase publishable key + OAuth flag
cp ../.env.example ../.env                # shared Supabase/LiveKit credentials (repo root)
npm run dev                               # http://localhost:3000 — loads both via dotenv-cli
```

See the root `CLAUDE.md` § Environment variables for what each variable is and where to get it.

## What's here

- **Auth**: Supabase Auth (email/password; Google OAuth exists but is off by default via `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`), enforced by `src/middleware.ts` against an invite-only allowlist (`allowed_emails` table).
- **Roles**: `admin` / `editor` / `viewer` / `pending`, plus an `is_master` flag grantable only via direct SQL (see root README's Master Control section).
- **Supabase client split**: `src/lib/supabase/client.ts` (browser), `server.ts` (SSR cookies), `service.ts` (service-role, bypasses RLS — API routes only).
- **Key routes**: `/api/webhook/livekit` (end-of-call sink from the agent), `/api/prompts` (versioned prompt CRUD), `/api/eval/trigger` (enqueues a Promptfoo run), `/api/master/*` (team management).
- **Known gap**: the Costs and Settings tabs currently render static placeholder content, not live data (no Langfuse cost proxy or key-rotation UI wired up yet).

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # production start (after build)
```

## Learn More (Next.js)

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
