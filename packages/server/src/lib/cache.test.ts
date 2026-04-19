import { describe, it, expect, beforeEach } from "vitest"
import {
  cacheKey,
  cacheGet,
  cacheSet,
  cacheInvalidate,
  cacheInvalidateUser,
  cacheStats,
  TTL,
  staleGet,
  staleSet,
  staleInvalidate,
} from "./cache.js"

// Use a unique user prefix per test suite to avoid cross-test contamination
const USER = "test-user-cache"

beforeEach(() => {
  // Clean up this user's entries before each test
  cacheInvalidateUser(USER)
})

describe("TTL constants", () => {
  it("defines expected keys", () => {
    expect(TTL.runs).toBeGreaterThan(0)
    expect(TTL.repos).toBeGreaterThan(TTL.runs)
    expect(TTL.score).toBeGreaterThan(TTL.repos)
  })
})

describe("cacheKey", () => {
  it("formats as userId:path", () => {
    expect(cacheKey("alice", "/repos/foo")).toBe("alice:/repos/foo")
  })

  it("handles empty prefix", () => {
    expect(cacheKey("alice", "")).toBe("alice:")
  })
})

describe("cacheGet / cacheSet", () => {
  it("returns undefined for missing key", () => {
    expect(cacheGet(cacheKey(USER, "/missing"))).toBeUndefined()
  })

  it("stores and retrieves a value", () => {
    const key = cacheKey(USER, "/repos")
    cacheSet(key, { data: [1, 2, 3] }, TTL.default)
    expect(cacheGet(key)).toEqual({ data: [1, 2, 3] })
  })

  it("stores and retrieves a string value", () => {
    const key = cacheKey(USER, "/name")
    cacheSet(key, "hello", TTL.default)
    expect(cacheGet<string>(key)).toBe("hello")
  })

  it("overwrites an existing entry", () => {
    const key = cacheKey(USER, "/overwrite")
    cacheSet(key, "first", TTL.default)
    cacheSet(key, "second", TTL.default)
    expect(cacheGet<string>(key)).toBe("second")
  })

  it("stores values with long TTL without eviction", () => {
    const key = cacheKey(USER, "/ttl-test")
    cacheSet(key, "persistent", TTL.repos)
    expect(cacheGet(key)).toBe("persistent")
  })
})

describe("cacheInvalidate", () => {
  it("deletes entries matching the prefix", () => {
    const k1 = cacheKey(USER, "GET:/repos/foo/actions/runs")
    const k2 = cacheKey(USER, "GET:/repos/foo/actions/jobs")
    const k3 = cacheKey(USER, "GET:/repos/bar/actions/runs")
    cacheSet(k1, "a", TTL.default)
    cacheSet(k2, "b", TTL.default)
    cacheSet(k3, "c", TTL.default)

    cacheInvalidate(USER, "GET:/repos/foo/")
    expect(cacheGet(k1)).toBeUndefined()
    expect(cacheGet(k2)).toBeUndefined()
    expect(cacheGet(k3)).toBe("c")
  })

  it("does nothing when prefix matches nothing", () => {
    const key = cacheKey(USER, "GET:/repos/baz")
    cacheSet(key, "safe", TTL.default)
    cacheInvalidate(USER, "GET:/repos/zzz")
    expect(cacheGet(key)).toBe("safe")
  })
})

describe("cacheInvalidateUser", () => {
  it("removes all entries for the user", () => {
    const k1 = cacheKey(USER, "GET:/repos")
    const k2 = cacheKey(USER, "GET:/orgs")
    cacheSet(k1, "x", TTL.default)
    cacheSet(k2, "y", TTL.default)

    cacheInvalidateUser(USER)
    expect(cacheGet(k1)).toBeUndefined()
    expect(cacheGet(k2)).toBeUndefined()
  })

  it("does not affect other users", () => {
    const OTHER = "other-user"
    const myKey = cacheKey(USER, "GET:/repos")
    const otherKey = cacheKey(OTHER, "GET:/repos")
    cacheSet(myKey, "mine", TTL.default)
    cacheSet(otherKey, "theirs", TTL.default)

    cacheInvalidateUser(USER)
    expect(cacheGet(myKey)).toBeUndefined()
    expect(cacheGet(otherKey)).toBe("theirs")

    // cleanup
    cacheInvalidateUser(OTHER)
  })
})

describe("stale store", () => {
  const STALE_USER = "stale-test-user"

  beforeEach(() => {
    staleInvalidate(STALE_USER, "")
  })

  it("returns undefined for missing key", () => {
    expect(staleGet(cacheKey(STALE_USER, "/missing"))).toBeUndefined()
  })

  it("stores and retrieves data with etag", () => {
    const key = cacheKey(STALE_USER, "GET:/repos/foo/actions/runs")
    staleSet(key, [{ id: 1 }], '"abc123"')
    const entry = staleGet(key)
    expect(entry?.data).toEqual([{ id: 1 }])
    expect(entry?.etag).toBe('"abc123"')
  })

  it("stores data with null etag", () => {
    const key = cacheKey(STALE_USER, "GET:/repos/foo/actions/runs?page=2")
    staleSet(key, { total: 0 }, null)
    expect(staleGet(key)?.etag).toBeNull()
  })

  it("overwrites an existing stale entry", () => {
    const key = cacheKey(STALE_USER, "GET:/repos/foo")
    staleSet(key, { v: 1 }, '"etag1"')
    staleSet(key, { v: 2 }, '"etag2"')
    const entry = staleGet(key)
    expect(entry?.data).toEqual({ v: 2 })
    expect(entry?.etag).toBe('"etag2"')
  })

  it("staleInvalidate removes entries matching prefix", () => {
    const k1 = cacheKey(STALE_USER, "GET:/repos/foo/actions/runs")
    const k2 = cacheKey(STALE_USER, "GET:/repos/foo/actions/jobs")
    const k3 = cacheKey(STALE_USER, "GET:/repos/bar/actions/runs")
    staleSet(k1, "a", null)
    staleSet(k2, "b", null)
    staleSet(k3, "c", null)

    staleInvalidate(STALE_USER, "GET:/repos/foo/")
    expect(staleGet(k1)).toBeUndefined()
    expect(staleGet(k2)).toBeUndefined()
    expect(staleGet(k3)).toBeDefined()
  })

  it("staleInvalidate does nothing when prefix matches nothing", () => {
    const key = cacheKey(STALE_USER, "GET:/repos/safe")
    staleSet(key, "kept", '"e"')
    staleInvalidate(STALE_USER, "GET:/repos/zzz")
    expect(staleGet(key)).toBeDefined()
  })

  it("stale store is independent of the main cache", () => {
    const key = cacheKey(STALE_USER, "GET:/repos/independent")
    cacheSet(key, "main-data", TTL.default)
    staleSet(key, "stale-data", '"etag"')

    // Main cache has its value
    expect(cacheGet(key)).toBe("main-data")
    // Stale store has its own value
    expect(staleGet(key)?.data).toBe("stale-data")

    // Invalidating main cache does not touch stale store
    cacheInvalidate(STALE_USER, "GET:/repos/independent")
    expect(cacheGet(key)).toBeUndefined()
    expect(staleGet(key)?.data).toBe("stale-data")
  })
})

describe("cacheStats", () => {
  it("returns numeric fields", () => {
    const stats = cacheStats()
    expect(typeof stats.size).toBe("number")
    expect(typeof stats.maxSize).toBe("number")
    expect(typeof stats.itemCount).toBe("number")
    expect(stats.maxSize).toBeGreaterThan(0)
  })

  it("itemCount increases after set", () => {
    const before = cacheStats().itemCount
    cacheSet(cacheKey(USER, "/stats-test"), { v: 1 }, TTL.default)
    expect(cacheStats().itemCount).toBeGreaterThan(before)
  })
})
