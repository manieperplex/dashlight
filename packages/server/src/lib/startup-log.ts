import { log } from "./logger.js"

/**
 * Logs build-time CA bundle status and outbound proxy configuration at startup.
 *
 * CA trust:
 *   NODE_EXTRA_CA_CERTS is baked into the image at build time via EXTRA_CA_CERTS_B64.
 *   Node.js loads it into its default TLS context at process startup; EnvHttpProxyAgent
 *   in github.ts inherits that context automatically — no explicit ca option needed.
 *   The cert path is logged for diagnostics; the cert value itself is never logged.
 *
 * Proxy:
 *   EnvHttpProxyAgent reads HTTPS_PROXY, HTTP_PROXY, and NO_PROXY automatically.
 *   This log entry confirms the values active at startup.
 */
export function logStartupDiagnostics(): void {
  if (process.env["NODE_EXTRA_CA_CERTS"]) {
    log.info("Build-time CA bundle active", { path: process.env["NODE_EXTRA_CA_CERTS"] })
  }

  const proxyUrl = process.env["HTTPS_PROXY"] ?? process.env["HTTP_PROXY"]
  if (proxyUrl) {
    log.info("Outbound proxy configured", {
      proxyUrl,
      noProxy: process.env["NO_PROXY"] ?? "(none)",
    })
  }
}
