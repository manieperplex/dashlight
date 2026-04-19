import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"
import { rateLimiter } from "./rate-limit.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp(windowMs = 1000, limit = 3) {
  const app = new Hono()
  app.use(
    "/*",
    rateLimiter({
      windowMs,
      limit,
      keyGenerator: (c) => c.req.header("x-key") ?? "default",
    }),
  )
  app.get("/", (c) => c.json({ ok: true }))
  return app
}

async function request(app: Hono, key = "user1") {
  return app.request("/", { headers: { "x-key": key } })
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// ── Allow / block ──────────────────────────────────────────────────────────────

describe("rateLimiter — allow and block", () => {
  it("allows requests up to the limit", async () => {
    const app = makeApp(1000, 3)
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
      expect(res.status).toBe(200)
    }
  })

  it("returns 429 on the request that exceeds the limit", async () => {
    const app = makeApp(1000, 3)
    for (let i = 0; i < 3; i++) await request(app)

    const res = await request(app)
    expect(res.status).toBe(429)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/too many requests/i)
  })

  it("blocks all subsequent requests once the limit is hit", async () => {
    const app = makeApp(1000, 1)
    await request(app)

    const res1 = await request(app)
    const res2 = await request(app)
    expect(res1.status).toBe(429)
    expect(res2.status).toBe(429)
  })
})

// ── Key isolation ─────────────────────────────────────────────────────────────

describe("rateLimiter — key isolation", () => {
  it("tracks different keys independently", async () => {
    const app = makeApp(1000, 1)

    const res1 = await request(app, "user1")
    const res2 = await request(app, "user2")

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it("does not block user2 when user1 exceeds the limit", async () => {
    const app = makeApp(1000, 2)
    await request(app, "user1")
    await request(app, "user1")
    await request(app, "user1") // user1 over limit

    const res = await request(app, "user2")
    expect(res.status).toBe(200)
  })
})

// ── Window reset ──────────────────────────────────────────────────────────────

describe("rateLimiter — window reset", () => {
  it("allows requests again after the window expires", async () => {
    const app = makeApp(1000, 1)
    await request(app)
    expect((await request(app)).status).toBe(429)

    vi.advanceTimersByTime(1001)

    expect((await request(app)).status).toBe(200)
  })

  it("starts a fresh window after reset", async () => {
    const app = makeApp(1000, 2)
    await request(app)
    await request(app)
    expect((await request(app)).status).toBe(429)

    vi.advanceTimersByTime(1001)

    // Should allow exactly 2 more before blocking again
    expect((await request(app)).status).toBe(200)
    expect((await request(app)).status).toBe(200)
    expect((await request(app)).status).toBe(429)
  })
})

// ── Concurrency ───────────────────────────────────────────────────────────────

describe("rateLimiter — concurrency", () => {
  it("handles concurrent requests without over-counting", async () => {
    const app = makeApp(1000, 3)

    // Fire 3 concurrent requests for the same key
    const results = await Promise.all([
      request(app, "concurrent"),
      request(app, "concurrent"),
      request(app, "concurrent"),
    ])

    const statuses = results.map((r) => r.status)
    // All 3 should be allowed since limit is 3
    expect(statuses.every((s) => s === 200)).toBe(true)
  })

  it("blocks the 4th concurrent request when limit is 3", async () => {
    const app = makeApp(1000, 3)

    const results = await Promise.all([
      request(app, "concurrent"),
      request(app, "concurrent"),
      request(app, "concurrent"),
      request(app, "concurrent"),
    ])

    const statuses = results.map((r) => r.status)
    const allowed = statuses.filter((s) => s === 200).length
    const blocked = statuses.filter((s) => s === 429).length
    expect(allowed).toBe(3)
    expect(blocked).toBe(1)
  })
})
