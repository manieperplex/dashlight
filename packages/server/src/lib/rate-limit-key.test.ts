import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { rateLimitKey, isValidIp } from "./rate-limit-key.js"

// Mock @hono/node-server/conninfo so we can control what getConnInfo returns
vi.mock("@hono/node-server/conninfo", () => ({
  getConnInfo: vi.fn(),
}))

import { getConnInfo } from "@hono/node-server/conninfo"
const mockGetConnInfo = vi.mocked(getConnInfo)

function makeContext(headers: Record<string, string> = {}): import("hono").Context {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
  } as unknown as import("hono").Context
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env["TRUST_PROXY"]
})

afterEach(() => {
  delete process.env["TRUST_PROXY"]
})

describe("rateLimitKey — TRUST_PROXY unset (default)", () => {
  it("uses the TCP connection remote address", () => {
    mockGetConnInfo.mockReturnValue({ remote: { address: "10.0.0.1", port: 54321, addressType: "IPv4" } })
    const key = rateLimitKey(makeContext())
    expect(key).toBe("10.0.0.1")
    expect(mockGetConnInfo).toHaveBeenCalled()
  })

  it("returns 'anon' when remote address is null", () => {
    mockGetConnInfo.mockReturnValue({ remote: { address: undefined, port: undefined, addressType: "IPv4" } })
    const key = rateLimitKey(makeContext())
    expect(key).toBe("anon")
  })

  it("returns 'anon' when getConnInfo throws (non-Node runtime)", () => {
    mockGetConnInfo.mockImplementation(() => { throw new Error("not available") })
    const key = rateLimitKey(makeContext())
    expect(key).toBe("anon")
  })

  it("ignores X-Forwarded-For even when present", () => {
    mockGetConnInfo.mockReturnValue({ remote: { address: "192.168.1.5", port: 12345, addressType: "IPv4" } })
    const key = rateLimitKey(makeContext({ "x-forwarded-for": "1.2.3.4" }))
    // Must return the TCP address, not the spoofed header
    expect(key).toBe("192.168.1.5")
  })
})

describe("rateLimitKey — TRUST_PROXY=true", () => {
  beforeEach(() => {
    process.env["TRUST_PROXY"] = "true"
  })

  it("uses first IP in X-Forwarded-For", () => {
    const key = rateLimitKey(makeContext({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" }))
    expect(key).toBe("203.0.113.5")
  })

  it("trims whitespace around the first X-Forwarded-For IP", () => {
    const key = rateLimitKey(makeContext({ "x-forwarded-for": "  203.0.113.5  , 10.0.0.1" }))
    expect(key).toBe("203.0.113.5")
  })

  it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
    const key = rateLimitKey(makeContext({ "x-real-ip": "198.51.100.7" }))
    expect(key).toBe("198.51.100.7")
  })

  it("returns 'anon' when neither proxy header is present", () => {
    const key = rateLimitKey(makeContext())
    expect(key).toBe("anon")
  })

  it("does not call getConnInfo when TRUST_PROXY is true", () => {
    rateLimitKey(makeContext({ "x-forwarded-for": "1.2.3.4" }))
    expect(mockGetConnInfo).not.toHaveBeenCalled()
  })

  it("rejects a spoofed non-IP X-Forwarded-For and returns 'anon'", () => {
    const key = rateLimitKey(makeContext({ "x-forwarded-for": "../../etc/passwd" }))
    expect(key).toBe("anon")
  })

  it("rejects an arbitrary string X-Forwarded-For and returns 'anon'", () => {
    const key = rateLimitKey(makeContext({ "x-forwarded-for": "not-an-ip" }))
    expect(key).toBe("anon")
  })

  it("rejects a spoofed X-Real-IP and falls back to 'anon'", () => {
    const key = rateLimitKey(makeContext({ "x-real-ip": "evil-string" }))
    expect(key).toBe("anon")
  })

  it("accepts a valid IPv6 address from X-Forwarded-For", () => {
    const key = rateLimitKey(makeContext({ "x-forwarded-for": "2001:db8::1" }))
    expect(key).toBe("2001:db8::1")
  })
})

describe("isValidIp", () => {
  it("accepts a valid IPv4 address", () => expect(isValidIp("192.168.1.1")).toBe(true))
  it("accepts a valid IPv6 address", () => expect(isValidIp("2001:db8::1")).toBe(true))
  it("rejects an arbitrary string", () => expect(isValidIp("not-an-ip")).toBe(false))
  it("rejects a path traversal string", () => expect(isValidIp("../../etc/passwd")).toBe(false))
  it("rejects an empty string", () => expect(isValidIp("")).toBe(false))
})
