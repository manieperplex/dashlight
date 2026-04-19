import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadLog(level?: string) {
  if (level !== undefined) vi.stubEnv("LOG_LEVEL", level)
  vi.resetModules()
  const { log } = await import("./logger.js")
  return log
}

function captureStdout() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true)
}

function captureStderr() {
  return vi.spyOn(process.stderr, "write").mockImplementation(() => true)
}

function parseLine(spy: ReturnType<typeof vi.spyOn>, callIndex = 0) {
  return JSON.parse(spy.mock.calls[callIndex][0] as string)
}

// ── Output format ─────────────────────────────────────────────────────────────

describe("output format", () => {
  it("writes a JSON line terminated with \\n to stdout for info", async () => {
    const log = await loadLog("debug")
    const spy = captureStdout()
    log.info("hello")
    expect(spy).toHaveBeenCalledOnce()
    const raw = spy.mock.calls[0][0] as string
    expect(raw).toMatch(/\n$/)
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it("entry contains level, message, and ISO timestamp", async () => {
    const log = await loadLog("debug")
    const spy = captureStdout()
    log.info("test message")
    const entry = parseLine(spy)
    expect(entry.level).toBe("info")
    expect(entry.message).toBe("test message")
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it("merges context fields into the entry", async () => {
    const log = await loadLog("debug")
    const spy = captureStdout()
    log.info("with context", { userId: 42, repo: "api" })
    const entry = parseLine(spy)
    expect(entry.userId).toBe(42)
    expect(entry.repo).toBe("api")
  })

  it("works without a context argument", async () => {
    const log = await loadLog("debug")
    const spy = captureStdout()
    log.debug("no context")
    expect(spy).toHaveBeenCalledOnce()
    expect(parseLine(spy).message).toBe("no context")
  })
})

// ── stdout vs stderr routing ──────────────────────────────────────────────────

describe("stream routing", () => {
  it("debug → stdout", async () => {
    const log = await loadLog("debug")
    const out = captureStdout()
    const err = captureStderr()
    log.debug("d")
    expect(out).toHaveBeenCalledOnce()
    expect(err).not.toHaveBeenCalled()
  })

  it("info → stdout", async () => {
    const log = await loadLog("debug")
    const out = captureStdout()
    const err = captureStderr()
    log.info("i")
    expect(out).toHaveBeenCalledOnce()
    expect(err).not.toHaveBeenCalled()
  })

  it("warn → stderr", async () => {
    const log = await loadLog("debug")
    const out = captureStdout()
    const err = captureStderr()
    log.warn("w")
    expect(err).toHaveBeenCalledOnce()
    expect(out).not.toHaveBeenCalled()
  })

  it("error → stderr", async () => {
    const log = await loadLog("debug")
    const out = captureStdout()
    const err = captureStderr()
    log.error("e")
    expect(err).toHaveBeenCalledOnce()
    expect(out).not.toHaveBeenCalled()
  })
})

// ── Level filtering ───────────────────────────────────────────────────────────

describe("level filtering", () => {
  it("LOG_LEVEL=debug passes all four levels", async () => {
    const log = await loadLog("debug")
    const out = captureStdout()
    const err = captureStderr()
    log.debug("d"); log.info("i"); log.warn("w"); log.error("e")
    expect(out.mock.calls.length + err.mock.calls.length).toBe(4)
  })

  it("LOG_LEVEL=info suppresses debug", async () => {
    const log = await loadLog("info")
    const out = captureStdout()
    log.debug("suppressed")
    expect(out).not.toHaveBeenCalled()
  })

  it("LOG_LEVEL=info passes info, warn, error", async () => {
    const log = await loadLog("info")
    const out = captureStdout()
    const err = captureStderr()
    log.info("i"); log.warn("w"); log.error("e")
    expect(out.mock.calls.length + err.mock.calls.length).toBe(3)
  })

  it("LOG_LEVEL=warn suppresses debug and info", async () => {
    const log = await loadLog("warn")
    const out = captureStdout()
    const err = captureStderr()
    log.debug("d"); log.info("i")
    expect(out).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
  })

  it("LOG_LEVEL=warn passes warn and error", async () => {
    const log = await loadLog("warn")
    const err = captureStderr()
    log.warn("w"); log.error("e")
    expect(err).toHaveBeenCalledTimes(2)
  })

  it("LOG_LEVEL=error suppresses debug, info, and warn", async () => {
    const log = await loadLog("error")
    const out = captureStdout()
    const err = captureStderr()
    log.debug("d"); log.info("i"); log.warn("w")
    expect(out).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
  })

  it("LOG_LEVEL=error passes error", async () => {
    const log = await loadLog("error")
    const err = captureStderr()
    log.error("e")
    expect(err).toHaveBeenCalledOnce()
  })

  it("invalid LOG_LEVEL falls back to info", async () => {
    const log = await loadLog("verbose")
    const out = captureStdout()
    log.debug("suppressed")
    expect(out).not.toHaveBeenCalled()
    log.info("passes")
    expect(out).toHaveBeenCalledOnce()
  })

  it("absent LOG_LEVEL defaults to info", async () => {
    vi.unstubAllEnvs()
    delete process.env["LOG_LEVEL"]
    const log = await loadLog()
    const out = captureStdout()
    log.debug("suppressed")
    expect(out).not.toHaveBeenCalled()
    log.info("passes")
    expect(out).toHaveBeenCalledOnce()
  })
})
