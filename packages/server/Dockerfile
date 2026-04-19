# ── Build stage ──────────────────────────────────────────────────────────────
# Context: repo root (set in docker-compose.yml)
FROM node:25-alpine AS builder

# Docker Desktop's build network has no IPv6 routing; force Node.js to prefer
# IPv4 so corepack/pnpm can reach registry.npmjs.org without timing out.
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/server/src/ ./packages/server/src/
COPY packages/server/tsconfig.json ./packages/server/
RUN pnpm --filter @dashlight/server build

# Create a standalone bundle: production deps + dist, no dev deps, no other packages
RUN pnpm deploy --filter @dashlight/server --prod /standalone

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:25.9.0-alpine3.22 AS runner

# Upgrade OS packages to patch any CVEs present in the pinned base image,
# then install only what the healthcheck needs.
RUN apk upgrade --no-cache && \
    addgroup -S dashlight && adduser -S dashlight -G dashlight && \
    apk add --no-cache curl
WORKDIR /app

# pnpm deploy gives us a clean directory: package.json + node_modules + dist
COPY --from=builder /standalone ./

USER dashlight
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/system/health || exit 1

CMD ["node", "dist/index.js"]
