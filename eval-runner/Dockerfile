# Build context: REPO ROOT, not eval-runner/ — this service reads
# evals/goldenset.yaml by default (GOLDENSET_PATH resolves relative to
# dist/index.js), so the image needs that sibling file bundled in too.
# GOLDENSET_PATH is set explicitly below to an absolute path rather than
# relying on the relative-path default lining up correctly.
#
# Build from repo root:
#   docker build -f eval-runner/Dockerfile -t medicall-eval-runner .

# Node 22, not 20: @supabase/supabase-js's Realtime client requires native
# WebSocket support (added in Node 22) — on Node 20 it throws at import time
# ("Node.js 20 detected without native WebSocket support"), crashing the
# service immediately, before it ever reaches app code.
FROM node:22-slim
WORKDIR /app

# Promptfoo requires git for some test fetchers; install minimal deps
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

COPY eval-runner/package*.json ./
RUN npm ci

COPY eval-runner/tsconfig.json ./
COPY eval-runner/src ./src

# Build TS
RUN npm run build

COPY evals/goldenset.yaml /app/evals/goldenset.yaml

ENV NODE_ENV=production
ENV PORT=3001
ENV GOLDENSET_PATH=/app/evals/goldenset.yaml
EXPOSE 3001

# Healthcheck route is GET /health
CMD ["node", "dist/index.js"]
