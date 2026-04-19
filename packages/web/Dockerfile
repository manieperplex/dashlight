# ── Build stage ──────────────────────────────────────────────────────────────
# Context: repo root (set in docker-compose.yml)
FROM node:24-alpine AS builder

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
COPY packages/web/index.html ./packages/web/
COPY packages/web/src/ ./packages/web/src/
COPY packages/web/tsconfig.json packages/web/vite.config.ts ./packages/web/
RUN pnpm --filter @dashlight/web build

# ── Runtime stage (Nginx) ─────────────────────────────────────────────────────
FROM nginx:1.29.8-alpine AS runner

# Upgrade OS packages to patch any CVEs present in the pinned base image.
RUN apk upgrade --no-cache

COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost/nginx-health || exit 1
