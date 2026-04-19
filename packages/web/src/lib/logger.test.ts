import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadLog(viteLogLevel?: string) {
  if (viteLogLevel !== undefined) vi.stubEnv("VITE_LOG_LEVEL", viteLogLevel)
  vi.resetModules()
  const { log } = await import("./logger.js")
  return log
}

function spyConsole() {
  return {
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info:  vi.spyOn(console, "info").mockImplementation(() => {}),
    warn:  vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  }
}

// ── Console method routing ────────────────────────────────────────────────────

describe("console method routing", () => {
  it("log.debug → console.debug", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.debug("d")
    expect(spies.debug).toHaveBeenCalledOnce()
    expect(spies.info).not.toHaveBeenCalled()
  })

  it("log.info → console.info", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.info("i")
    expect(spies.info).toHaveBeenCalledOnce()
    expect(spies.debug).not.toHaveBeenCalled()
  })

  it("log.warn → console.warn", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.warn("w")
    expect(spies.warn).toHaveBeenCalledOnce()
  })

  it("log.error → console.error", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.error("e")
    expect(spies.error).toHaveBeenCalledOnce()
  })
})

// ── Output structure ──────────────────────────────────────────────────────────

describe("output structure", () => {
  it("entry has level, message, and ISO timestamp", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.info("hello")
    const entry = spies.info.mock.calls[0][0] as Record<string, unknown>
    expect(entry.level).toBe("info")
    expect(entry.message).toBe("hello")
    expect(typeof entry.timestamp).toBe("string")
    expect(entry.timestamp as string).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("merges context fields into the entry", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.warn("ctx test", { repo: "api", count: 3 })
    const entry = spies.warn.mock.calls[0][0] as Record<string, unknown>
    expect(entry.repo).toBe("api")
    expect(entry.count).toBe(3)
  })

  it("works without a context argument", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.error("bare")
    const entry = spies.error.mock.calls[0][0] as Record<string, unknown>
    expect(entry.message).toBe("bare")
  })
})

// ── Level filtering ───────────────────────────────────────────────────────────

describe("level filtering", () => {
  it("VITE_LOG_LEVEL=debug passes all four levels", async () => {
    const log = await loadLog("debug")
    const spies = spyConsole()
    log.debug("d"); log.info("i"); log.warn("w"); log.error("e")
    const total = spies.debug.mock.calls.length + spies.info.mock.calls.length +
                  spies.warn.mock.calls.length + spies.error.mock.calls.length
    expect(total).toBe(4)
  })

  it("VITE_LOG_LEVEL=info suppresses debug", async () => {
    const log = await loadLog("info")
    const spies = spyConsole()
    log.debug("suppressed")
    expect(spies.debug).not.toHaveBeenCalled()
  })

  it("VITE_LOG_LEVEL=info passes info, warn, error", async () => {
    const log = await loadLog("info")
    const spies = spyConsole()
    log.info("i"); log.warn("w"); log.error("e")
    expect(spies.info).toHaveBeenCalledOnce()
    expect(spies.warn).toHaveBeenCalledOnce()
    expect(spies.error).toHaveBeenCalledOnce()
  })

  it("VITE_LOG_LEVEL=warn suppresses debug and info", async () => {
    const log = await loadLog("warn")
    const spies = spyConsole()
    log.debug("d"); log.info("i")
    expect(spies.debug).not.toHaveBeenCalled()
    expect(spies.info).not.toHaveBeenCalled()
  })

  it("VITE_LOG_LEVEL=warn passes warn and error", async () => {
    const log = await loadLog("warn")
    const spies = spyConsole()
    log.warn("w"); log.error("e")
    expect(spies.warn).toHaveBeenCalledOnce()
    expect(spies.error).toHaveBeenCalledOnce()
  })

  it("VITE_LOG_LEVEL=error suppresses debug, info, and warn", async () => {
    const log = await loadLog("error")
    const spies = spyConsole()
    log.debug("d"); log.info("i"); log.warn("w")
    expect(spies.debug).not.toHaveBeenCalled()
    expect(spies.info).not.toHaveBeenCalled()
    expect(spies.warn).not.toHaveBeenCalled()
  })

  it("VITE_LOG_LEVEL=error passes error", async () => {
    const log = await loadLog("error")
    const spies = spyConsole()
    log.error("e")
    expect(spies.error).toHaveBeenCalledOnce()
  })

  it("invalid VITE_LOG_LEVEL falls back to debug in dev", async () => {
    // Vitest runs in dev mode (import.meta.env.DEV = true), so fallback is debug
    const log = await loadLog("nonsense")
    const spies = spyConsole()
    log.debug("passes")
    expect(spies.debug).toHaveBeenCalledOnce()
  })
})
