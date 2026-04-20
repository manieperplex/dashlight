# ── Build stage ──────────────────────────────────────────────────────────────
# Context: repo root (set in docker-compose.yml)
FROM node:24-alpine AS builder

# Docker Desktop's build network has no IPv6 routing; force Node.js to prefer
# IPv4 so corepack/pnpm can reach registry.npmjs.org without timing out.
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"

WORKDIR /app

# ── Build-time CA certificate (optional) ──────────────────────────────────────
# Pass EXTRA_CA_CERTS_B64 (base64-encoded PEM bundle) to inject corporate CA
# trust before any networked build step runs (corepack, pnpm install, vite build).
# If unset the build continues with the base image trust store only.
ARG EXTRA_CA_CERTS_B64
ENV DASHLIGHT_EXTRA_CA_FILE="/opt/dashlight/extra-ca-certificates.pem"
ENV DASHLIGHT_CA_BUNDLE="/opt/dashlight/ca-certificates-with-extra.pem"
ENV SSL_CERT_FILE="/opt/dashlight/ca-certificates-with-extra.pem"
ENV NODE_EXTRA_CA_CERTS="/opt/dashlight/extra-ca-certificates.pem"

RUN mkdir -p /opt/dashlight && \
    cp /etc/ssl/certs/ca-certificates.crt "$DASHLIGHT_CA_BUNDLE" && \
    if [ -n "$EXTRA_CA_CERTS_B64" ]; then \
      printf '%s' "$EXTRA_CA_CERTS_B64" | base64 -d > "$DASHLIGHT_EXTRA_CA_FILE" && \
      cat "$DASHLIGHT_EXTRA_CA_FILE" >> "$DASHLIGHT_CA_BUNDLE"; \
    else \
      : > "$DASHLIGHT_EXTRA_CA_FILE"; \
    fi

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
# The nginx runner serves only static files — no outbound HTTPS, no cert bundle needed.
FROM nginx:1.29.8-alpine AS runner

# Upgrade OS packages to patch any CVEs present in the pinned base image.
RUN apk upgrade --no-cache

COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# wget is available in nginx-alpine; no curl needed.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/nginx-health || exit 1
