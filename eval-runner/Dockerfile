FROM node:20-slim
WORKDIR /app

# Promptfoo requires git for some test fetchers; install minimal deps
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Build TS
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck route is GET /health
CMD ["node", "dist/index.js"]
