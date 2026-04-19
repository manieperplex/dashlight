import { readFileSync } from "node:fs"
import { rootCertificates } from "node:tls"
import { EnvHttpProxyAgent } from "undici"
import { log } from "./logger.js"

function loadCaCert(): string | undefined {
  if (process.env["CA_CERT_BASE64"]) {
    return Buffer.from(process.env["CA_CERT_BASE64"], "base64").toString("utf8")
  }
  if (process.env["CA_CERT_PATH"]) {
    try {
      return readFileSync(process.env["CA_CERT_PATH"], "utf8")
    } catch {
      log.warn("Could not read CA_CERT_PATH", { path: process.env["CA_CERT_PATH"] })
    }
  }
  return undefined
}

export const caCert = loadCaCert()

/**
 * Builds the full CA chain used for TLS verification.
 *
 * The custom cert is appended to Node.js's built-in Mozilla root bundle so
 * that standard HTTPS connections (GitHub API, etc.) continue to work while
 * the corporate CA is also trusted. Passing only the custom cert would
 * discard the entire root bundle and break all other TLS connections.
 */
export function buildCaChain(customCert: string): string[] {
  return [...rootCertificates, customCert]
}

/**
 * Returns an EnvHttpProxyAgent that automatically reads HTTP_PROXY, HTTPS_PROXY,
 * and NO_PROXY from environment variables, bypassing the proxy for hosts listed
 * in NO_PROXY. A custom CA certificate is applied when caCert is set.
 */
export function buildUndiciAgent(): EnvHttpProxyAgent {
  return new EnvHttpProxyAgent(
    caCert ? { connect: { ca: buildCaChain(caCert) } } : {}
  )
}

export function logCertStatus(): void {
  if (caCert) {
    const source = process.env["CA_CERT_BASE64"]
      ? "CA_CERT_BASE64"
      : `CA_CERT_PATH (${process.env["CA_CERT_PATH"]})`
    log.info("Custom CA certificate loaded", { source })
  }

  const proxyUrl = process.env["HTTPS_PROXY"] ?? process.env["HTTP_PROXY"]
  if (proxyUrl) {
    log.info("Outbound proxy configured", {
      proxyUrl,
      noProxy: process.env["NO_PROXY"] ?? "(none)",
    })
  }
}
