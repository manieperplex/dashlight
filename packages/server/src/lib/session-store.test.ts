import { describe, it, expect, vi, afterEach } from "vitest"
import { sessionCreate, sessionGet, sessionDestroy, sessionCount } from "./session-store.js"

// Clean up only sessions created in this test file
const created: string[] = []

function create(token = "tok", userId = "user1"): string {
  const id = sessionCreate(token, userId)
  created.push(id)
  return id
}

afterEach(() => {
  created.splice(0).forEach(sessionDestroy)
})

describe("sessionCreate", () => {
  it("returns a UUID-like string", () => {
    const id = create()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("returns a unique ID each call", () => {
    const a = create()
    const b = create()
    expect(a).not.toBe(b)
  })
})

describe("sessionGet", () => {
  it("returns the stored entry", () => {
    const id = create("github-token-xyz", "uid-42")
    const entry = sessionGet(id)
    expect(entry).toBeDefined()
    expect(entry!.token).toBe("github-token-xyz")
    expect(entry!.userId).toBe("uid-42")
  })

  it("returns undefined for unknown session ID", () => {
    expect(sessionGet("non-existent-id")).toBeUndefined()
  })

  it("returns undefined and removes entry for an expired session", () => {
    vi.useFakeTimers()
    const id = create()
    // Advance 8 days past TTL
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000)
    expect(sessionGet(id)).toBeUndefined()
    // Entry should be cleaned from the store
    expect(sessionGet(id)).toBeUndefined()
    vi.useRealTimers()
  })

  it("returns entry before it expires", () => {
    vi.useFakeTimers()
    const id = create()
    vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000) // 6 days — still valid
    expect(sessionGet(id)).toBeDefined()
    vi.useRealTimers()
  })
})

describe("sessionDestroy", () => {
  it("removes the session entry", () => {
    const id = create()
    expect(sessionGet(id)).toBeDefined()
    sessionDestroy(id)
    expect(sessionGet(id)).toBeUndefined()
    created.pop() // already destroyed
  })

  it("does not throw for unknown session ID", () => {
    expect(() => sessionDestroy("ghost-id")).not.toThrow()
  })
})

describe("sessionCount", () => {
  it("reflects the number of active sessions", () => {
    const before = sessionCount()
    const a = create()
    const b = create()
    expect(sessionCount()).toBe(before + 2)
    sessionDestroy(a)
    sessionDestroy(b)
    created.splice(created.indexOf(a), 1)
    created.splice(created.indexOf(b), 1)
    expect(sessionCount()).toBe(before)
  })
})
