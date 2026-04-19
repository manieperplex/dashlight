import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { signSession, verifySession, validateSessionSecret } from "./jwt.js"

const VALID_SECRET = "a-very-long-secret-that-is-at-least-32-characters"

beforeEach(() => {
  process.env["SESSION_SECRET"] = VALID_SECRET
})

afterEach(() => {
  delete process.env["SESSION_SECRET"]
})

const basePayload = {
  sub: "12345",
  sessionId: "sess-abc",
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://github.com/images/error/octocat.png",
}

describe("signSession / verifySession", () => {
  it("produces a JWT string", async () => {
    const token = await signSession(basePayload)
    expect(typeof token).toBe("string")
    expect(token.split(".")).toHaveLength(3)
  })

  it("round-trips payload fields", async () => {
    const token = await signSession(basePayload)
    const payload = await verifySession(token)
    expect(payload.sub).toBe(basePayload.sub)
    expect(payload.sessionId).toBe(basePayload.sessionId)
    expect(payload.login).toBe(basePayload.login)
    expect(payload.name).toBe(basePayload.name)
    expect(payload.avatarUrl).toBe(basePayload.avatarUrl)
  })

  it("includes iat and exp in the verified payload", async () => {
    const token = await signSession(basePayload)
    const payload = await verifySession(token)
    expect(typeof payload.iat).toBe("number")
    expect(typeof payload.exp).toBe("number")
    expect(payload.exp).toBeGreaterThan(payload.iat)
  })

  it("sets expiry ~7 days from now", async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await signSession(basePayload)
    const payload = await verifySession(token)
    const sevenDaysInSeconds = 7 * 24 * 60 * 60
    expect(payload.exp - before).toBeGreaterThanOrEqual(sevenDaysInSeconds - 5)
    expect(payload.exp - before).toBeLessThanOrEqual(sevenDaysInSeconds + 5)
  })

  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env["SESSION_SECRET"]
    await expect(signSession(basePayload)).rejects.toThrow("SESSION_SECRET")
  })

  it("throws when SESSION_SECRET is too short", async () => {
    process.env["SESSION_SECRET"] = "short"
    await expect(signSession(basePayload)).rejects.toThrow("SESSION_SECRET")
  })

  it("throws verifySession for a tampered token", async () => {
    const token = await signSession(basePayload)
    const parts = token.split(".")
    parts[1] = Buffer.from(JSON.stringify({ sub: "hacker" })).toString("base64url")
    const tampered = parts.join(".")
    await expect(verifySession(tampered)).rejects.toThrow()
  })

  it("throws verifySession for a token signed with a different secret", async () => {
    const token = await signSession(basePayload)
    process.env["SESSION_SECRET"] = "different-secret-that-is-also-at-least-32-chars"
    await expect(verifySession(token)).rejects.toThrow()
  })
})

describe("validateSessionSecret", () => {
  it("does not throw when secret is valid", () => {
    expect(() => validateSessionSecret()).not.toThrow()
  })

  it("calls process.exit(1) when secret is missing", () => {
    delete process.env["SESSION_SECRET"]
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
    expect(() => validateSessionSecret()).toThrow("exit")
    expect(exit).toHaveBeenCalledWith(1)
    exit.mockRestore()
  })

  it("calls process.exit(1) when secret is too short", () => {
    process.env["SESSION_SECRET"] = "tooshort"
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
    expect(() => validateSessionSecret()).toThrow("exit")
    expect(exit).toHaveBeenCalledWith(1)
    exit.mockRestore()
  })
})
