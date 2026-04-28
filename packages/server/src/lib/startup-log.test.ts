import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("./logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

async function load() {
  vi.resetModules()
  const mod = await import("./startup-log.js")
  const { log } = await import("./logger.js")
  return { ...mod, log }
}

// ── CA bundle logging ─────────────────────────────────────────────────────────

describe("logStartupDiagnostics — CA bundle", () => {
  it("logs path when NODE_EXTRA_CA_CERTS is set", async () => {
    vi.stubEnv("NODE_EXTRA_CA_CERTS", "/opt/dashlight/extra-ca-certificates.pem")
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Build-time CA bundle active", {
      path: "/opt/dashlight/extra-ca-certificates.pem",
    })
  })

  it("does not log CA bundle info when NODE_EXTRA_CA_CERTS is not set", async () => {
    delete process.env["NODE_EXTRA_CA_CERTS"]
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    const caCalls = vi.mocked(log.info).mock.calls.filter(
      (c) => c[0] === "Build-time CA bundle active"
    )
    expect(caCalls).toHaveLength(0)
  })

  it("never logs the cert value itself", async () => {
    vi.stubEnv("NODE_EXTRA_CA_CERTS", "/opt/dashlight/extra-ca-certificates.pem")
    // Simulate a real cert file path — value should never appear in log output
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    const allArgs = JSON.stringify(vi.mocked(log.info).mock.calls)
    expect(allArgs).not.toContain("BEGIN CERTIFICATE")
    expect(allArgs).not.toContain("END CERTIFICATE")
  })
})

// ── Proxy logging ─────────────────────────────────────────────────────────────

describe("logStartupDiagnostics — proxy", () => {
  it("logs proxy URL and noProxy when HTTPS_PROXY is set", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.corp:8080")
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1")
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Outbound proxy configured", {
      proxyUrl: "http://proxy.corp:8080",
      noProxy: "localhost,127.0.0.1",
    })
  })

  it("falls back to HTTP_PROXY when HTTPS_PROXY is absent", async () => {
    vi.stubEnv("HTTP_PROXY", "http://fallback:3128")
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    expect(vi.mocked(log.info)).toHaveBeenCalledWith("Outbound proxy configured", {
      proxyUrl: "http://fallback:3128",
      noProxy: "(none)",
    })
  })

  it("prefers HTTPS_PROXY over HTTP_PROXY when both are set", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://primary:8080")
    vi.stubEnv("HTTP_PROXY", "http://fallback:3128")
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    const call = vi.mocked(log.info).mock.calls.find(
      (c) => c[0] === "Outbound proxy configured"
    )
    expect(call?.[1]?.proxyUrl).toBe("http://primary:8080")
  })

  it("reports noProxy as '(none)' when NO_PROXY is not set", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy:8080")
    delete process.env["NO_PROXY"]
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    const call = vi.mocked(log.info).mock.calls.find(
      (c) => c[0] === "Outbound proxy configured"
    )
    expect(call?.[1]?.noProxy).toBe("(none)")
  })

  it("does not log proxy info when no proxy env vars are set", async () => {
    delete process.env["HTTPS_PROXY"]
    delete process.env["HTTP_PROXY"]
    const { logStartupDiagnostics, log } = await load()
    logStartupDiagnostics()
    const proxyCalls = vi.mocked(log.info).mock.calls.filter(
      (c) => c[0] === "Outbound proxy configured"
    )
    expect(proxyCalls).toHaveLength(0)
  })
})
