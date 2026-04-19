import { describe, it, expect, vi, afterEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("./logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}))

vi.mock("node:tls", () => ({
  rootCertificates: [
    "-----BEGIN CERTIFICATE-----\nROOT_A\n-----END CERTIFICATE-----",
    "-----BEGIN CERTIFICATE-----\nROOT_B\n-----END CERTIFICATE-----",
  ],
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

/** Re-import certs.ts with a clean module registry so module-level code reruns. */
async function loadCerts() {
  vi.resetModules()
  const certs = await import("./certs.js")
  // Import logger after certs so we get the same cached instance certs.ts uses.
  const { log } = await import("./logger.js")
  const { readFileSync } = await import("node:fs")
  return { ...certs, log, readFileSync }
}

// ── buildUndiciAgent ──────────────────────────────────────────────────────────

describe("buildUndiciAgent", () => {
  it("returns an EnvHttpProxyAgent", async () => {
    const { buildUndiciAgent } = await loadCerts()
    const { EnvHttpProxyAgent } = await import("undici")
    expect(buildUndiciAgent()).toBeInstanceOf(EnvHttpProxyAgent)
  })

  it("returns an EnvHttpProxyAgent even when HTTPS_PROXY is set (NO_PROXY is handled internally)", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.example.com:8080")
    const { buildUndiciAgent } = await loadCerts()
    const { EnvHttpProxyAgent } = await import("undici")
    expect(buildUndiciAgent()).toBeInstanceOf(EnvHttpProxyAgent)
  })

  it("returns an EnvHttpProxyAgent even when no proxy env vars are set", async () => {
    vi.unstubAllEnvs()
    delete process.env["HTTPS_PROXY"]
    delete process.env["HTTP_PROXY"]
    delete process.env["NO_PROXY"]
    const { buildUndiciAgent } = await loadCerts()
    const { EnvHttpProxyAgent } = await import("undici")
    expect(buildUndiciAgent()).toBeInstanceOf(EnvHttpProxyAgent)
  })
})

// ── buildCaChain ──────────────────────────────────────────────────────────────

describe("buildCaChain", () => {
  it("returns an array containing the Node.js root certificates", async () => {
    const { buildCaChain } = await loadCerts()
    const chain = buildCaChain("custom-cert")
    expect(chain).toContain("-----BEGIN CERTIFICATE-----\nROOT_A\n-----END CERTIFICATE-----")
    expect(chain).toContain("-----BEGIN CERTIFICATE-----\nROOT_B\n-----END CERTIFICATE-----")
  })

  it("appends the custom cert after the root bundle, not instead of it", async () => {
    const { buildCaChain } = await loadCerts()
    const customCert = "-----BEGIN CERTIFICATE-----\nCUSTOM\n-----END CERTIFICATE-----"
    const chain = buildCaChain(customCert)
    expect(chain.at(-1)).toBe(customCert)
    expect(chain.length).toBe(3) // 2 mocked roots + 1 custom
  })

  it("returns a new array on each call (no shared reference)", async () => {
    const { buildCaChain } = await loadCerts()
    const a = buildCaChain("cert-a")
    const b = buildCaChain("cert-b")
    expect(a).not.toBe(b)
  })
})

// ── loadCaCert (via caCert export) ───────────────────────────────────────────

describe("loadCaCert", () => {
  it("decodes CA_CERT_BASE64 into a PEM string", async () => {
    const pem = "-----BEGIN CERTIFICATE-----\nMIItest\n-----END CERTIFICATE-----"
    vi.stubEnv("CA_CERT_BASE64", Buffer.from(pem).toString("base64"))
    const { caCert } = await loadCerts()
    expect(caCert).toBe(pem)
  })

  it("reads the file at CA_CERT_PATH when no base64 var is set", async () => {
    vi.stubEnv("CA_CERT_PATH", "/etc/ssl/custom.crt")
    vi.resetModules()
    // Set up the readFileSync mock before importing certs
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue("file-cert-content")
    const { caCert } = await import("./certs.js")
    expect(caCert).toBe("file-cert-content")
  })

  it("prefers CA_CERT_BASE64 over CA_CERT_PATH when both are set", async () => {
    const pem = "base64-cert"
    vi.stubEnv("CA_CERT_BASE64", Buffer.from(pem).toString("base64"))
    vi.stubEnv("CA_CERT_PATH", "/etc/ssl/custom.crt")
    vi.resetModules()
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue("file-cert-content")
    const { caCert } = await import("./certs.js")
    expect(caCert).toBe(pem)
    expect(vi.mocked(readFileSync)).not.toHaveBeenCalled()
  })

  it("warns and returns undefined when CA_CERT_PATH file cannot be read", async () => {
    vi.stubEnv("CA_CERT_PATH", "/bad/path.crt")
    vi.resetModules()
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error("ENOENT") })
    const { caCert } = await import("./certs.js")
    const { log } = await import("./logger.js")
    expect(caCert).toBeUndefined()
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      "Could not read CA_CERT_PATH",
      { path: "/bad/path.crt" }
    )
  })

  it("returns undefined when neither CA_CERT_BASE64 nor CA_CERT_PATH is set", async () => {
    delete process.env["CA_CERT_BASE64"]
    delete process.env["CA_CERT_PATH"]
    const { caCert } = await loadCerts()
    expect(caCert).toBeUndefined()
  })
})

// ── logCertStatus ─────────────────────────────────────────────────────────────

describe("logCertStatus", () => {
  it("logs proxy URL and noProxy when HTTPS_PROXY is set", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.corp:8080")
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1")
    const { logCertStatus, log } = await loadCerts()
    logCertStatus()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Outbound proxy configured", {
      proxyUrl: "http://proxy.corp:8080",
      noProxy: "localhost,127.0.0.1",
    })
  })

  it("falls back to HTTP_PROXY when HTTPS_PROXY is absent", async () => {
    vi.stubEnv("HTTP_PROXY", "http://fallback:3128")
    const { logCertStatus, log } = await loadCerts()
    logCertStatus()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Outbound proxy configured", {
      proxyUrl: "http://fallback:3128",
      noProxy: "(none)",
    })
  })

  it("reports noProxy as '(none)' when NO_PROXY is not set", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy:8080")
    delete process.env["NO_PROXY"]
    const { logCertStatus, log } = await loadCerts()
    logCertStatus()
    const call = vi.mocked(log.info).mock.calls.find((c) => c[0] === "Outbound proxy configured")
    expect(call?.[1]?.noProxy).toBe("(none)")
  })

  it("does not log proxy info when no proxy env vars are set", async () => {
    delete process.env["HTTPS_PROXY"]
    delete process.env["HTTP_PROXY"]
    const { logCertStatus, log } = await loadCerts()
    logCertStatus()
    const proxyCalls = vi.mocked(log.info).mock.calls.filter(
      (c) => c[0] === "Outbound proxy configured"
    )
    expect(proxyCalls).toHaveLength(0)
  })

  it("logs CA cert source as CA_CERT_BASE64 when that var is set", async () => {
    vi.stubEnv("CA_CERT_BASE64", Buffer.from("cert").toString("base64"))
    const { logCertStatus, log } = await loadCerts()
    logCertStatus()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Custom CA certificate loaded", {
      source: "CA_CERT_BASE64",
    })
  })

  it("logs CA cert source with path when CA_CERT_PATH is set", async () => {
    vi.stubEnv("CA_CERT_PATH", "/etc/ssl/custom.crt")
    vi.resetModules()
    const { readFileSync } = await import("node:fs")
    vi.mocked(readFileSync).mockReturnValue("cert-content")
    const { logCertStatus } = await import("./certs.js")
    const { log } = await import("./logger.js")
    logCertStatus()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Custom CA certificate loaded", {
      source: "CA_CERT_PATH (/etc/ssl/custom.crt)",
    })
  })

  it("does not log CA cert info when no cert vars are set", async () => {
    delete process.env["CA_CERT_BASE64"]
    delete process.env["CA_CERT_PATH"]
    const { logCertStatus, log } = await loadCerts()
    logCertStatus()
    const certCalls = vi.mocked(log.info).mock.calls.filter(
      (c) => c[0] === "Custom CA certificate loaded"
    )
    expect(certCalls).toHaveLength(0)
  })
})
