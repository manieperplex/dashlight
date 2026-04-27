# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

# Docker Desktop's build network has no IPv6 routing; force Node.js to prefer
# IPv4 so npm/pnpm can reach registry.npmjs.org without timing out.
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"

WORKDIR /app

# ── Build-time CA certificate (optional) ──────────────────────────────────────
# Pass EXTRA_CA_CERTS_B64 (base64-encoded PEM bundle) to inject corporate CA
# trust before any networked build step runs (npm install, pnpm install, vite build).
ARG EXTRA_CA_CERTS_B64
ENV DASHLIGHT_EXTRA_CA_FILE="/opt/dashlight/extra-ca-certificates.pem"
ENV DASHLIGHT_CA_BUNDLE="/opt/dashlight/ca-certificates-with-extra.pem"
ENV SSL_CERT_FILE="/opt/dashlight/ca-certificates-with-extra.pem"
ENV NODE_EXTRA_CA_CERTS="/opt/dashlight/extra-ca-certificates.pem"

RUN mkdir -p /opt/dashlight && \
    cp /etc/ssl/certs/ca-certificates.crt "$DASHLIGHT_CA_BUNDLE" && \
    if [ -n "$EXTRA_CA_CERTS_B64" ]; then \
      printf '%s' "$EXTRA_CA_CERTS_B64" | base64 -d > /tmp/dashlight-extra-ca-decoded && \
      if grep -q 'BEGIN CERTIFICATE' /tmp/dashlight-extra-ca-decoded; then \
        mv /tmp/dashlight-extra-ca-decoded "$DASHLIGHT_EXTRA_CA_FILE"; \
      else \
        base64 -d /tmp/dashlight-extra-ca-decoded > "$DASHLIGHT_EXTRA_CA_FILE" && \
        rm -f /tmp/dashlight-extra-ca-decoded; \
      fi && \
      cat "$DASHLIGHT_EXTRA_CA_FILE" >> "$DASHLIGHT_CA_BUNDLE"; \
    else \
      : > "$DASHLIGHT_EXTRA_CA_FILE"; \
    fi

# Copy .npmrc if present (e.g. for corporate Artifactory proxy credentials).
# Create an empty .npmrc first so the COPY never fails when the file is absent.
RUN touch /root/.npmrc
COPY .npmrc* /root/

# Simpler bootstrap path: npm respects /root/.npmrc for registry/auth.
RUN npm install -g pnpm@9.15.4

# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/web/index.html ./packages/web/
COPY packages/web/public/ ./packages/web/public/
COPY packages/web/src/ ./packages/web/src/
COPY packages/web/tsconfig.json packages/web/vite.config.ts ./packages/web/
RUN pnpm --filter @dashlight/web build

# ── Runtime stage (Nginx) ─────────────────────────────────────────────────────
# The nginx runner serves only static files — no outbound HTTPS, no cert bundle needed.
FROM nginx:1.29.8-alpine AS runner

COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# wget is available in nginx-alpine; no curl needed.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/nginx-health || exit 1
