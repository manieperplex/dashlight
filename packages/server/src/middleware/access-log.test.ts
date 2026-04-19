import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../lib/logger.js", () => ({
  log: {
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  },
}))

import { log } from "../lib/logger.js"
import { accessLog } from "./access-log.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp(status = 200) {
  const app = new Hono()
  app.use("*", accessLog())
  app.get("/test", (c) => c.json({ ok: true }, status))
  app.post("/submit", (c) => c.json({ ok: true }, status))
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("accessLog middleware", () => {
  it("calls log.info with message 'http'", async () => {
    const app = makeApp()
    await app.fetch(new Request("http://localhost/test"))
    expect(log.info).toHaveBeenCalledOnce()
    expect(vi.mocked(log.info).mock.calls[0][0]).toBe("http")
  })

  it("records the HTTP method", async () => {
    const app = makeApp()
    await app.fetch(new Request("http://localhost/test", { method: "GET" }))
    const ctx = vi.mocked(log.info).mock.calls[0][1]
    expect(ctx?.method).toBe("GET")
  })

  it("records the request path", async () => {
    const app = makeApp()
    await app.fetch(new Request("http://localhost/test"))
    const ctx = vi.mocked(log.info).mock.calls[0][1]
    expect(ctx?.path).toBe("/test")
  })

  it("records the response status", async () => {
    const app = makeApp(201)
    await app.fetch(new Request("http://localhost/test"))
    const ctx = vi.mocked(log.info).mock.calls[0][1]
    expect(ctx?.status).toBe(201)
  })

  it("records a non-negative ms duration", async () => {
    const app = makeApp()
    await app.fetch(new Request("http://localhost/test"))
    const ctx = vi.mocked(log.info).mock.calls[0][1]
    expect(typeof ctx?.ms).toBe("number")
    expect(ctx?.ms as number).toBeGreaterThanOrEqual(0)
  })

  it("logs POST requests correctly", async () => {
    const app = makeApp()
    await app.fetch(new Request("http://localhost/submit", { method: "POST" }))
    const ctx = vi.mocked(log.info).mock.calls[0][1]
    expect(ctx?.method).toBe("POST")
    expect(ctx?.path).toBe("/submit")
  })
})
