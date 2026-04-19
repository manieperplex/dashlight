import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("../lib/github.js", () => {
  class GitHubApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message)
      this.name = "GitHubApiError"
    }
  }
  class GitHubNotFoundError extends GitHubApiError {
    constructor(message: string) { super(message, 404); this.name = "GitHubNotFoundError" }
  }
  class GitHubRateLimitError extends GitHubApiError {
    constructor(public resetAt: number | null) {
      super("GitHub API rate limit exceeded", 429)
      this.name = "GitHubRateLimitError"
    }
  }
  return { githubFetch: vi.fn(), GitHubApiError, GitHubNotFoundError, GitHubRateLimitError }
})

vi.mock("../lib/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheInvalidate: vi.fn(),
  cacheKey: vi.fn((userId: string, path: string) => `${userId}:${path}`),
  TTL: {
    runs: 120000, jobs: 120000, annotations: 300000, workflows: 600000,
    repos: 900000, orgs: 1800000, score: 86400000, yaml: 604800000,
    logs: 604800000, default: 300000,
  },
  staleGet: vi.fn(),
  staleSet: vi.fn(),
  staleInvalidate: vi.fn(),
}))

vi.mock("../middleware/auth.js", () => ({
  authMiddleware: vi.fn(async (c: import("hono").Context, next: () => Promise<void>) => {
    c.set("session", { sub: "u1", login: "octocat", name: "Octocat", avatarUrl: "", sessionId: "s1" })
    c.set("githubToken", "tok")
    await next()
  }),
}))

vi.mock("../lib/logger.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { githubFetch, GitHubNotFoundError, GitHubApiError, GitHubRateLimitError } from "../lib/github.js"
import { cacheGet, cacheSet, cacheInvalidate, staleGet, staleSet, staleInvalidate } from "../lib/cache.js"
import proxyRouter from "./proxy.js"

const mockGithubFetch = vi.mocked(githubFetch)
const mockCacheGet = vi.mocked(cacheGet)
const mockCacheSet = vi.mocked(cacheSet)
const mockCacheInvalidate = vi.mocked(cacheInvalidate)
const mockStaleGet = vi.mocked(staleGet)
const mockStaleSet = vi.mocked(staleSet)
const mockStaleInvalidate = vi.mocked(staleInvalidate)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono()
  app.route("/proxy", proxyRouter)
  return app
}

type GithubResult = {
  data: unknown
  rateLimitRemaining: number | null
  rateLimitReset: number | null
  status: number
  etag: string | null
  grantedScopes: null
}

function githubResult(
  data: unknown,
  overrides: Partial<{ rateLimitRemaining: number | null; status: number; etag: string | null }> = {},
): GithubResult {
  return {
    data,
    rateLimitRemaining: overrides.rateLimitRemaining !== undefined ? overrides.rateLimitRemaining : 100,
    rateLimitReset: null,
    status: overrides.status ?? 200,
    etag: overrides.etag ?? null,
    grantedScopes: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCacheGet.mockReturnValue(undefined)
  mockStaleGet.mockReturnValue(undefined)
})

// ── GET /* — cache ────────────────────────────────────────────────────────────

describe("GET /proxy/* — cache behaviour", () => {
  it("returns cached data with X-Cache: HIT", async () => {
    mockCacheGet.mockReturnValueOnce({ total_count: 1, workflow_runs: [] })

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("HIT")
    expect(mockGithubFetch).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ total_count: 1, workflow_runs: [] })
  })

  it("fetches from GitHub and populates cache on MISS", async () => {
    const data = { total_count: 0, workflow_runs: [] }
    mockGithubFetch.mockResolvedValueOnce(githubResult(data))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("MISS")
    expect(mockCacheSet).toHaveBeenCalled()
    expect(await res.json()).toEqual(data)
  })

  it("forwards X-RateLimit-Remaining from GitHub", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}, { rateLimitRemaining: 42 }))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(res.headers.get("X-RateLimit-Remaining")).toBe("42")
  })

  it("omits X-RateLimit-Remaining when GitHub returns null", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}, { rateLimitRemaining: null }))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(res.headers.get("X-RateLimit-Remaining")).toBeNull()
  })

  it("stores a stale entry alongside the cache on a successful fetch", async () => {
    const data = { runs: [] }
    const etag = '"abc123"'
    mockGithubFetch.mockResolvedValueOnce(githubResult(data, { etag }))

    await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(mockStaleSet).toHaveBeenCalledWith(expect.any(String), data, etag)
  })

  it("preserves query string when building the cache key and GitHub path", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({ workflow_runs: [] }))

    await makeApp().request("/proxy/repos/owner/repo/actions/runs?per_page=10&page=2")

    const calledPath = vi.mocked(mockGithubFetch).mock.calls[0]?.[1] as string
    expect(calledPath).toContain("per_page=10")
    expect(calledPath).toContain("page=2")
  })
})

// ── GET /* — ETag revalidation ────────────────────────────────────────────────

describe("GET /proxy/* — ETag revalidation (304)", () => {
  it("sends If-None-Match when a stale etag exists", async () => {
    mockStaleGet.mockReturnValue({ data: { runs: [] }, etag: '"my-etag"' })
    mockGithubFetch.mockResolvedValueOnce(githubResult({ runs: [] }, { etag: '"my-etag"' }))

    await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(mockGithubFetch).toHaveBeenCalledWith(
      "tok",
      expect.any(String),
      expect.objectContaining({ etag: '"my-etag"' }),
    )
  })

  it("restores stale data and writes it to cache on 304", async () => {
    const staleData = { total_count: 5, workflow_runs: ["old"] }
    mockStaleGet.mockReturnValue({ data: staleData, etag: '"stale-etag"' })
    mockGithubFetch.mockResolvedValueOnce(githubResult(null, { status: 304, rateLimitRemaining: 99 }))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs")

    expect(res.status).toBe(200)
    expect(mockCacheSet).toHaveBeenCalledWith(expect.any(String), staleData, expect.any(Number))
    expect(await res.json()).toEqual(staleData)
  })
})

// ── GET /* — request coalescing ───────────────────────────────────────────────

describe("GET /proxy/* — request coalescing", () => {
  it("issues only one GitHub fetch for concurrent requests to the same path", async () => {
    let resolveGithubFetch!: (v: GithubResult) => void
    mockGithubFetch.mockImplementationOnce(
      () => new Promise<GithubResult>((resolve) => { resolveGithubFetch = resolve }),
    )

    const app = makeApp()
    const req1 = app.request("/proxy/repos/owner/repo/actions/runs")
    const req2 = app.request("/proxy/repos/owner/repo/actions/runs")

    resolveGithubFetch(githubResult({ total_count: 0, workflow_runs: [] }))

    const [res1, res2] = await Promise.all([req1, req2])

    expect(mockGithubFetch).toHaveBeenCalledTimes(1)
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })
})

// ── GET /repos/:owner/:repo/actions/jobs/:jobId/logs ──────────────────────────

describe("GET /proxy/repos/:owner/:repo/actions/jobs/:jobId/logs", () => {
  it("returns cached log text with X-Cache: HIT", async () => {
    mockCacheGet.mockReturnValueOnce("log content here")

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/jobs/123/logs")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("HIT")
    expect(await res.text()).toBe("log content here")
    expect(mockGithubFetch).not.toHaveBeenCalled()
  })

  it("fetches with followRedirect=true and caches on MISS", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult("raw log text\nline 2"))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/jobs/123/logs")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("MISS")
    expect(mockGithubFetch).toHaveBeenCalledWith(
      "tok",
      expect.stringContaining("/jobs/123/logs"),
      expect.objectContaining({ followRedirect: true }),
    )
    expect(await res.text()).toBe("raw log text\nline 2")
  })
})

// ── POST /* ────────────────────────────────────────────────────────────────────

describe("POST /proxy/*", () => {
  it("passes through to GitHub and returns the response", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs/99/rerun", {
      method: "POST",
    })

    expect(res.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledWith(
      "tok",
      expect.any(String),
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("forwards a JSON body to GitHub", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    await makeApp().request("/proxy/repos/owner/repo/actions/workflows/1/dispatches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    })

    expect(mockGithubFetch).toHaveBeenCalledWith(
      "tok",
      expect.any(String),
      expect.objectContaining({ body: { ref: "main" } }),
    )
  })

  it("invalidates cache after a POST", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    await makeApp().request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })

    expect(mockCacheInvalidate).toHaveBeenCalled()
  })
})

// ── PATCH /* ───────────────────────────────────────────────────────────────────

describe("PATCH /proxy/*", () => {
  it("passes through and invalidates cache", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs/99", { method: "PATCH" })

    expect(res.status).toBe(200)
    expect(mockCacheInvalidate).toHaveBeenCalled()
  })
})

// ── DELETE /* ─────────────────────────────────────────────────────────────────

describe("DELETE /proxy/*", () => {
  it("passes through and invalidates cache", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    const res = await makeApp().request("/proxy/repos/owner/repo/actions/runs/99", { method: "DELETE" })

    expect(res.status).toBe(200)
    expect(mockCacheInvalidate).toHaveBeenCalled()
  })
})

// ── Write deduplication ───────────────────────────────────────────────────────

describe("write deduplication (POST/PATCH/DELETE)", () => {
  it("returns 409 for a duplicate concurrent POST to the same path", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    const app = makeApp()
    const req1 = app.request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })
    const req2 = app.request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })

    const [res1, res2] = await Promise.all([req1, req2])
    const statuses = [res1.status, res2.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(mockGithubFetch).toHaveBeenCalledTimes(1)
  })

  it("returns 409 for a duplicate concurrent DELETE to the same path", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    const app = makeApp()
    const req1 = app.request("/proxy/repos/owner/repo/actions/runs/99", { method: "DELETE" })
    const req2 = app.request("/proxy/repos/owner/repo/actions/runs/99", { method: "DELETE" })

    const [res1, res2] = await Promise.all([req1, req2])
    const statuses = [res1.status, res2.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(mockGithubFetch).toHaveBeenCalledTimes(1)
  })

  it("returns 409 for a duplicate concurrent PATCH to the same path", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    const app = makeApp()
    const req1 = app.request("/proxy/repos/owner/repo/actions/runs/99", { method: "PATCH" })
    const req2 = app.request("/proxy/repos/owner/repo/actions/runs/99", { method: "PATCH" })

    const [res1, res2] = await Promise.all([req1, req2])
    const statuses = [res1.status, res2.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(mockGithubFetch).toHaveBeenCalledTimes(1)
  })

  it("allows the same path after a write completes", async () => {
    mockGithubFetch.mockResolvedValue(githubResult({}))

    const app = makeApp()
    const res1 = await app.request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })
    const res2 = await app.request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledTimes(2)
  })

  it("releases the write lock after a failed POST so the path can be retried", async () => {
    mockGithubFetch
      .mockRejectedValueOnce(new GitHubApiError("Bad Gateway", 502))
      .mockResolvedValueOnce(githubResult({}))

    const app = makeApp()
    const fail = await app.request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })
    expect(fail.status).toBe(502)

    const retry = await app.request("/proxy/repos/owner/repo/actions/runs/99/rerun", { method: "POST" })
    expect(retry.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledTimes(2)
  })

  it("different paths for the same user are not deduplicated", async () => {
    mockGithubFetch.mockResolvedValue(githubResult({}))

    const app = makeApp()
    const [res1, res2] = await Promise.all([
      app.request("/proxy/repos/owner/repo/actions/runs/1/rerun", { method: "POST" }),
      app.request("/proxy/repos/owner/repo/actions/runs/2/rerun", { method: "POST" }),
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledTimes(2)
  })
})

// ── invalidateOnWrite ──────────────────────────────────────────────────────────

describe("cache invalidation on write", () => {
  it("invalidates runs, jobs, workflows, and score for the affected repo", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    await makeApp().request("/proxy/repos/myorg/myrepo/actions/runs/42/rerun", { method: "POST" })

    const invalidatedPaths = mockCacheInvalidate.mock.calls.map((call) => call[1])
    expect(invalidatedPaths).toContain("GET:/repos/myorg/myrepo/actions/runs")
    expect(invalidatedPaths).toContain("GET:/repos/myorg/myrepo/actions/jobs")
    expect(invalidatedPaths).toContain("GET:/repos/myorg/myrepo/actions/workflows")
    expect(invalidatedPaths).toContain("score:myorg/myrepo")

    const staleInvalidatedPaths = mockStaleInvalidate.mock.calls.map((call) => call[1])
    expect(staleInvalidatedPaths).toContain("GET:/repos/myorg/myrepo/actions/runs")
    expect(staleInvalidatedPaths).toContain("GET:/repos/myorg/myrepo/actions/jobs")
  })

  it("does not invalidate when path has no repo segment", async () => {
    mockGithubFetch.mockResolvedValueOnce(githubResult({}))

    await makeApp().request("/proxy/user/orgs", { method: "POST" })

    expect(mockCacheInvalidate).not.toHaveBeenCalled()
    expect(mockStaleInvalidate).not.toHaveBeenCalled()
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("returns 404 for GitHubNotFoundError", async () => {
    mockGithubFetch.mockRejectedValueOnce(new GitHubNotFoundError("not found"))

    const res = await makeApp().request("/proxy/repos/owner/missing-repo")

    expect(res.status).toBe(404)
  })

  it("returns 503 with Retry-After=3600 for GitHubRateLimitError with null resetAt", async () => {
    mockGithubFetch.mockRejectedValueOnce(new GitHubRateLimitError(null))

    const res = await makeApp().request("/proxy/repos/owner/repo")

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("3600")
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/rate limit/i)
  })

  it("computes Retry-After from resetAt timestamp", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 120
    mockGithubFetch.mockRejectedValueOnce(new GitHubRateLimitError(resetAt))

    const res = await makeApp().request("/proxy/repos/owner/repo")

    expect(res.status).toBe(503)
    const retryAfter = Number(res.headers.get("Retry-After"))
    expect(retryAfter).toBeGreaterThanOrEqual(119)
    expect(retryAfter).toBeLessThanOrEqual(121)
  })

  it("forwards status code from GitHubApiError", async () => {
    mockGithubFetch.mockRejectedValueOnce(new GitHubApiError("Forbidden", 403))

    const res = await makeApp().request("/proxy/repos/owner/repo")

    expect(res.status).toBe(403)
  })

  it("returns 500 for unexpected errors", async () => {
    mockGithubFetch.mockRejectedValueOnce(new Error("network failure"))

    const res = await makeApp().request("/proxy/repos/owner/repo")

    expect(res.status).toBe(500)
  })
})
