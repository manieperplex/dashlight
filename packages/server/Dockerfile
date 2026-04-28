# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

# Docker Desktop's build network has no IPv6 routing; force Node.js to prefer
# IPv4 so npm/pnpm can reach registry.npmjs.org without timing out.
ENV NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"

WORKDIR /app

# ── Build-time CA certificate (optional) ──────────────────────────────────────
# Pass EXTRA_CA_CERTS_B64 (base64-encoded PEM bundle) to inject corporate CA
# trust before any networked build step runs (npm install, pnpm install, tsc).
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
COPY packages/server/src/ ./packages/server/src/
COPY packages/server/tsconfig.json ./packages/server/
RUN pnpm --filter @dashlight/server build

# Create a standalone bundle: production deps + dist, no dev deps, no other packages
RUN pnpm deploy --filter @dashlight/server --prod /standalone

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:24.3.0-alpine3.22 AS runner

# Copy cert bundle from builder for Node/runtime TLS trust.
COPY --from=builder /opt/dashlight/ /opt/dashlight/

RUN addgroup -S dashlight && adduser -S dashlight -G dashlight

WORKDIR /app

# Runtime Node process inherits build-time trust through environment variables.
# NODE_EXTRA_CA_CERTS points to the extra-only PEM; SSL_CERT_FILE points to the
# merged bundle (system roots + extra) for non-Node TLS clients.
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
