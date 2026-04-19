import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
  return { githubFetch: vi.fn(), GitHubApiError, GitHubNotFoundError }
})

vi.mock("../lib/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheKey: vi.fn((userId: string, path: string) => `${userId}:${path}`),
  TTL: { repos: 900000, default: 300000 },
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

import { githubFetch, GitHubNotFoundError, GitHubApiError } from "../lib/github.js"
import { cacheGet, cacheSet } from "../lib/cache.js"
import reposRouter from "./repos.js"

const mockGithubFetch = vi.mocked(githubFetch)
const mockCacheGet = vi.mocked(cacheGet)
const mockCacheSet = vi.mocked(cacheSet)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono()
  app.route("/api/repos", reposRouter)
  return app
}

function repoData(name: string) {
  return { id: Math.random(), full_name: name, name: name.split("/")[1] }
}

function githubResult(data: unknown) {
  return { data, rateLimitRemaining: 100, rateLimitReset: null, status: 200, etag: null, grantedScopes: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCacheGet.mockReturnValue(undefined)
  delete process.env["GITHUB_REPOS"]
  delete process.env["GITHUB_ORG"]
})

afterEach(() => {
  delete process.env["GITHUB_REPOS"]
  delete process.env["GITHUB_ORG"]
})

// ── Default mode (no env vars) ────────────────────────────────────────────────

describe("GET /api/repos — default mode (no env vars)", () => {
  it("fetches /user/repos and returns data", async () => {
    const data = [repoData("owner/repo1"), repoData("owner/repo2")]
    mockGithubFetch.mockResolvedValueOnce(githubResult(data))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledWith("tok", expect.stringContaining("/user/repos"))
    expect(await res.json()).toEqual(data)
  })

  it("returns cached data with X-Cache: HIT", async () => {
    const data = [repoData("owner/repo1")]
    mockCacheGet.mockReturnValueOnce(data)

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("HIT")
    expect(mockGithubFetch).not.toHaveBeenCalled()
    expect(await res.json()).toEqual(data)
  })

  it("sets cache after a successful fetch", async () => {
    const data = [repoData("owner/repo1")]
    mockGithubFetch.mockResolvedValueOnce(githubResult(data))

    await makeApp().request("/api/repos")

    expect(mockCacheSet).toHaveBeenCalledWith(expect.any(String), data, expect.any(Number))
  })
})

// ── GITHUB_ORG mode ────────────────────────────────────────────────────────────

describe("GET /api/repos — GITHUB_ORG mode", () => {
  beforeEach(() => { process.env["GITHUB_ORG"] = "myorg" })

  it("fetches /orgs/myorg/repos and returns data", async () => {
    const data = [repoData("myorg/alpha"), repoData("myorg/beta")]
    mockGithubFetch.mockResolvedValueOnce(githubResult(data))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledWith(
      "tok",
      expect.stringContaining("/orgs/myorg/repos"),
    )
    expect(await res.json()).toEqual(data)
  })

  it("returns cached data with X-Cache: HIT", async () => {
    const data = [repoData("myorg/alpha")]
    mockCacheGet.mockReturnValueOnce(data)

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("HIT")
    expect(mockGithubFetch).not.toHaveBeenCalled()
  })

  it("ignores whitespace-only GITHUB_ORG", async () => {
    process.env["GITHUB_ORG"] = "   "
    const data = [repoData("owner/repo1")]
    mockGithubFetch.mockResolvedValueOnce(githubResult(data))

    await makeApp().request("/api/repos")

    // Falls through to default mode — must fetch /user/repos
    expect(mockGithubFetch).toHaveBeenCalledWith("tok", expect.stringContaining("/user/repos"))
  })
})

// ── GITHUB_REPOS mode ──────────────────────────────────────────────────────────

describe("GET /api/repos — GITHUB_REPOS mode", () => {
  beforeEach(() => { process.env["GITHUB_REPOS"] = "owner/repo1,owner/repo2" })

  it("fetches each repo individually and returns all results", async () => {
    const repo1 = repoData("owner/repo1")
    const repo2 = repoData("owner/repo2")
    mockGithubFetch
      .mockResolvedValueOnce(githubResult(repo1))
      .mockResolvedValueOnce(githubResult(repo2))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    expect(mockGithubFetch).toHaveBeenCalledTimes(2)
    expect(mockGithubFetch).toHaveBeenCalledWith("tok", "/repos/owner/repo1")
    expect(mockGithubFetch).toHaveBeenCalledWith("tok", "/repos/owner/repo2")
    const body = await res.json() as unknown[]
    expect(body).toHaveLength(2)
  })

  it("returns only successful repos when one fetch fails", async () => {
    const repo1 = repoData("owner/repo1")
    mockGithubFetch
      .mockResolvedValueOnce(githubResult(repo1))
      .mockRejectedValueOnce(new GitHubNotFoundError("not found"))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body).toHaveLength(1)
    expect(body[0]).toEqual(repo1)
  })

  it("returns cached data with X-Cache: HIT", async () => {
    const data = [repoData("owner/repo1"), repoData("owner/repo2")]
    mockCacheGet.mockReturnValueOnce(data)

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache")).toBe("HIT")
    expect(mockGithubFetch).not.toHaveBeenCalled()
  })

  it("trims whitespace from repo names in GITHUB_REPOS", async () => {
    process.env["GITHUB_REPOS"] = " owner/repo1 , owner/repo2 "
    mockGithubFetch
      .mockResolvedValueOnce(githubResult(repoData("owner/repo1")))
      .mockResolvedValueOnce(githubResult(repoData("owner/repo2")))

    await makeApp().request("/api/repos")

    expect(mockGithubFetch).toHaveBeenCalledWith("tok", "/repos/owner/repo1")
    expect(mockGithubFetch).toHaveBeenCalledWith("tok", "/repos/owner/repo2")
  })

  it("GITHUB_REPOS takes precedence over GITHUB_ORG", async () => {
    process.env["GITHUB_ORG"] = "myorg"
    mockGithubFetch
      .mockResolvedValueOnce(githubResult(repoData("owner/repo1")))
      .mockResolvedValueOnce(githubResult(repoData("owner/repo2")))

    await makeApp().request("/api/repos")

    // Must not have fetched the org endpoint
    for (const call of mockGithubFetch.mock.calls) {
      expect(call[1]).not.toContain("/orgs/")
    }
  })

  it("ignores empty entries from a trailing comma in GITHUB_REPOS", async () => {
    process.env["GITHUB_REPOS"] = "owner/repo1,"
    mockGithubFetch.mockResolvedValueOnce(githubResult(repoData("owner/repo1")))

    await makeApp().request("/api/repos")

    expect(mockGithubFetch).toHaveBeenCalledTimes(1)
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("GET /api/repos — error handling", () => {
  it("returns 404 for GitHubNotFoundError", async () => {
    mockGithubFetch.mockRejectedValueOnce(new GitHubNotFoundError("not found"))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(404)
  })

  it("forwards status code from GitHubApiError", async () => {
    mockGithubFetch.mockRejectedValueOnce(new GitHubApiError("Forbidden", 403))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(403)
  })

  it("returns 500 for unexpected errors", async () => {
    mockGithubFetch.mockRejectedValueOnce(new Error("network failure"))

    const res = await makeApp().request("/api/repos")

    expect(res.status).toBe(500)
  })
})
