# ── Build stage ──────────────────────────────────────────────────────────────
# Context: repo root (set in docker-compose.yml)
FROM node:24-alpine AS builder

# Docker Desktop's build network has no IPv6 routing; force Node.js to prefer
# IPv4 so corepack/pnpm can reach registry.npmjs.org without timing out.
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"

WORKDIR /app

# ── Build-time CA certificate (optional) ──────────────────────────────────────
# Pass EXTRA_CA_CERTS_B64 (base64-encoded PEM bundle) to inject corporate CA
# trust before any networked build step runs (corepack, pnpm install, tsc).
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
COPY packages/server/src/ ./packages/server/src/
COPY packages/server/tsconfig.json ./packages/server/
RUN pnpm --filter @dashlight/server build

# Create a standalone bundle: production deps + dist, no dev deps, no other packages
RUN pnpm deploy --filter @dashlight/server --prod /standalone

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:24.3.0-alpine3.22 AS runner

# Upgrade OS packages to patch any CVEs present in the pinned base image.
RUN apk upgrade --no-cache && \
    addgroup -S dashlight && adduser -S dashlight -G dashlight

WORKDIR /app

# Copy cert bundle from builder so the runtime Node process inherits build-time trust.
# NODE_EXTRA_CA_CERTS points to the extra-only PEM; SSL_CERT_FILE points to the
# merged bundle (system roots + extra) for non-Node TLS clients.
COPY --from=builder /opt/dashlight/ /opt/dashlight/
ENV DASHLIGHT_EXTRA_CA_FILE="/opt/dashlight/extra-ca-certificates.pem"
ENV DASHLIGHT_CA_BUNDLE="/opt/dashlight/ca-certificates-with-extra.pem"
ENV SSL_CERT_FILE="/opt/dashlight/ca-certificates-with-extra.pem"
ENV NODE_EXTRA_CA_CERTS="/opt/dashlight/extra-ca-certificates.pem"

# pnpm deploy gives us a clean directory: package.json + node_modules + dist
COPY --from=builder /standalone ./

USER dashlight
EXPOSE 8080

# Use Node's built-in fetch — no curl dependency required in the minimal runtime image.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
