import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("../middleware/auth.js", () => ({
  authMiddleware: vi.fn(async (c: import("hono").Context, next: () => Promise<void>) => {
    c.set("session", { sub: "u1", login: "octocat", name: "Octocat", avatarUrl: "", sessionId: "s1" })
    c.set("githubToken", "tok")
    await next()
  }),
}))

import configRouter from "./config.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono()
  app.route("/api/config", configRouter)
  return app
}

beforeEach(() => {
  delete process.env["WATCH_WORKFLOWS"]
})

afterEach(() => {
  delete process.env["WATCH_WORKFLOWS"]
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/config", () => {
  it("returns empty watchWorkflows when WATCH_WORKFLOWS is not set", async () => {
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ watchWorkflows: [] })
  })

  it("returns empty watchWorkflows when WATCH_WORKFLOWS is an empty string", async () => {
    process.env["WATCH_WORKFLOWS"] = ""
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ watchWorkflows: [] })
  })

  it("returns a single workflow name", async () => {
    process.env["WATCH_WORKFLOWS"] = "publish"
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ watchWorkflows: ["publish"] })
  })

  it("parses comma-separated workflow names", async () => {
    process.env["WATCH_WORKFLOWS"] = "publish,security-scan,deploy"
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ watchWorkflows: ["publish", "security-scan", "deploy"] })
  })

  it("trims whitespace around workflow names", async () => {
    process.env["WATCH_WORKFLOWS"] = " publish , scan , deploy "
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ watchWorkflows: ["publish", "scan", "deploy"] })
  })

  it("filters out empty entries from trailing/double commas", async () => {
    process.env["WATCH_WORKFLOWS"] = "publish,,scan,"
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ watchWorkflows: ["publish", "scan"] })
  })

  it("requires authentication — rejects unauthenticated requests", async () => {
    // Temporarily override the mock to simulate an auth failure
    const { authMiddleware } = await import("../middleware/auth.js")
    vi.mocked(authMiddleware).mockImplementationOnce(async (c, _next) => {
      return c.json({ error: "Unauthorized" }, 401)
    })
    const res = await makeApp().request("/api/config")
    expect(res.status).toBe(401)
  })
})
