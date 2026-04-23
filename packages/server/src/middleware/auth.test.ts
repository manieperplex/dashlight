import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHash } from "node:crypto"
import { Hono } from "hono"

function passwordFingerprint(password: string): string {
  return createHash("sha256").update(password).digest("base64url").slice(0, 22)
}

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("../lib/jwt.js", () => ({
  verifySession: vi.fn(),
}))

vi.mock("../lib/session-store.js", () => ({
  sessionGet: vi.fn(),
}))

vi.mock("../lib/pat.js", () => ({
  getPATIdentity: vi.fn().mockReturnValue({
    login: "pat-user",
    name: "PAT User",
    avatarUrl: "https://example.com/avatar.png",
    userId: "99",
  }),
}))

import { verifySession } from "../lib/jwt.js"
import { sessionGet } from "../lib/session-store.js"
import { getPATIdentity } from "../lib/pat.js"
import { authMiddleware } from "./auth.js"
import type { AuthEnv } from "./auth.js"

const mockVerifySession = vi.mocked(verifySession)
const mockSessionGet = vi.mocked(sessionGet)
const mockGetPATIdentity = vi.mocked(getPATIdentity)

const VALID_PAYLOAD = {
  sub: "42",
  sessionId: "session-123",
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/583231",
  iat: 0,
  exp: 9999999999,
}

function makeApp() {
  const app = new Hono<AuthEnv>()
  app.use("/*", authMiddleware)
  app.get("/protected", (c) => {
    return c.json({
      login: c.get("session").login,
      token: c.get("githubToken"),
    })
  })
  return app
}

function withCookie(cookie: string) {
  return { headers: { cookie } }
}

// ── OAuth mode ────────────────────────────────────────────────────────────────

describe("OAuth mode (no GITHUB_TOKEN)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env["GITHUB_TOKEN"]
    delete process.env["APP_PASSWORD"]
  })

  afterEach(() => {
    delete process.env["GITHUB_TOKEN"]
    delete process.env["APP_PASSWORD"]
  })

  it("returns 401 when no session cookie is present", async () => {
    const res = await makeApp().request("/protected")
    expect(res.status).toBe(401)
  })

  it("returns 401 when JWT verification fails", async () => {
    mockVerifySession.mockRejectedValue(new Error("invalid jwt"))
    const res = await makeApp().request("/protected", withCookie("session=bad.jwt"))
    expect(res.status).toBe(401)
  })

  it("returns 401 when session is not found in store", async () => {
    mockVerifySession.mockResolvedValue(VALID_PAYLOAD)
    mockSessionGet.mockReturnValue(undefined)
    const res = await makeApp().request("/protected", withCookie("session=some.jwt"))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Session expired")
  })

  it("grants access and sets session + token when valid", async () => {
    mockVerifySession.mockResolvedValue(VALID_PAYLOAD)
    mockSessionGet.mockReturnValue({ token: "oauth-token", userId: "42", expiresAt: Date.now() + 60000 })
    const res = await makeApp().request("/protected", withCookie("session=valid.jwt"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { login: string; token: string }
    expect(body.login).toBe("octocat")
    expect(body.token).toBe("oauth-token")
  })
})

// ── PAT mode, open access ─────────────────────────────────────────────────────

describe("PAT mode, no APP_PASSWORD", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env["GITHUB_TOKEN"] = "ghp_test_token"
    delete process.env["APP_PASSWORD"]
    mockGetPATIdentity.mockReturnValue({
      login: "pat-user",
      name: "PAT User",
      avatarUrl: "https://example.com/avatar.png",
      userId: "99",
    })
  })

  afterEach(() => {
    delete process.env["GITHUB_TOKEN"]
    delete process.env["APP_PASSWORD"]
  })

  it("grants access without any cookie", async () => {
    const res = await makeApp().request("/protected")
    expect(res.status).toBe(200)
  })

  it("sets githubToken to GITHUB_TOKEN env value", async () => {
    const res = await makeApp().request("/protected")
    const body = (await res.json()) as { token: string }
    expect(body.token).toBe("ghp_test_token")
  })

  it("sets session login from PAT identity", async () => {
    const res = await makeApp().request("/protected")
    const body = (await res.json()) as { login: string }
    expect(body.login).toBe("pat-user")
  })

  it("does not check the session store", async () => {
    await makeApp().request("/protected")
    expect(mockSessionGet).not.toHaveBeenCalled()
  })

  it("does not check JWT even if a session cookie is present", async () => {
    const res = await makeApp().request("/protected", withCookie("session=some.jwt"))
    expect(res.status).toBe(200)
    expect(mockVerifySession).not.toHaveBeenCalled()
  })
})

// ── PAT mode + password ───────────────────────────────────────────────────────

describe("PAT mode, with APP_PASSWORD", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env["GITHUB_TOKEN"] = "ghp_test_token"
    process.env["APP_PASSWORD"] = "secret"
  })

  afterEach(() => {
    delete process.env["GITHUB_TOKEN"]
    delete process.env["APP_PASSWORD"]
  })

  it("returns 401 when no session cookie is present", async () => {
    const res = await makeApp().request("/protected")
    expect(res.status).toBe(401)
  })

  it("returns 401 when JWT verification fails", async () => {
    mockVerifySession.mockRejectedValue(new Error("invalid jwt"))
    const res = await makeApp().request("/protected", withCookie("session=bad.jwt"))
    expect(res.status).toBe(401)
  })

  it("grants access with a valid JWT and uses GITHUB_TOKEN (not session store token)", async () => {
    const pwh = passwordFingerprint("secret")
    mockVerifySession.mockResolvedValue({ ...VALID_PAYLOAD, sessionId: "pat", pwh })
    const res = await makeApp().request("/protected", withCookie("session=valid.jwt"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token).toBe("ghp_test_token") // PAT, not from session store
  })

  it("does not check session store even with valid JWT", async () => {
    const pwh = passwordFingerprint("secret")
    mockVerifySession.mockResolvedValue({ ...VALID_PAYLOAD, sessionId: "pat", pwh })
    await makeApp().request("/protected", withCookie("session=valid.jwt"))
    expect(mockSessionGet).not.toHaveBeenCalled()
  })

  it("returns 401 when a valid OAuth JWT (non-pat sessionId) is presented", async () => {
    // An old OAuth cookie has a UUID sessionId — it must be rejected in PAT+password mode
    mockVerifySession.mockResolvedValue({ ...VALID_PAYLOAD, sessionId: "550e8400-e29b-41d4-a716-446655440000" })
    const res = await makeApp().request("/protected", withCookie("session=oauth.jwt"))
    expect(res.status).toBe(401)
  })

  it("returns 401 when JWT has no pwh (issued before password mode was enabled)", async () => {
    // Token from PAT+open mode or before APP_PASSWORD was added has no pwh claim
    mockVerifySession.mockResolvedValue({ ...VALID_PAYLOAD, sessionId: "pat" })
    const res = await makeApp().request("/protected", withCookie("session=old.jwt"))
    expect(res.status).toBe(401)
  })

  it("returns 401 when JWT pwh does not match current APP_PASSWORD", async () => {
    // Token issued for a different password (e.g. after password rotation)
    const staleFingerprint = passwordFingerprint("old-password")
    mockVerifySession.mockResolvedValue({ ...VALID_PAYLOAD, sessionId: "pat", pwh: staleFingerprint })
    const res = await makeApp().request("/protected", withCookie("session=stale.jwt"))
    expect(res.status).toBe(401)
  })
})
