import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("./github.js", () => ({
  githubFetch: vi.fn(),
}))

vi.mock("./logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { githubFetch } from "./github.js"
import { validateAndCachePAT, getPATIdentity, _resetPATIdentity } from "./pat.js"

const mockGithubFetch = vi.mocked(githubFetch)

const MOCK_USER = {
  id: 42,
  login: "octocat",
  name: "The Octocat",
  avatar_url: "https://avatars.githubusercontent.com/u/583231",
}

function mockSuccess(overrides: Partial<typeof MOCK_USER> = {}, scopes = "repo,user:email") {
  mockGithubFetch.mockResolvedValue({
    data: { ...MOCK_USER, ...overrides },
    grantedScopes: scopes,
    rateLimitRemaining: 4999,
    rateLimitReset: null,
    status: 200,
    etag: null,
  } as never)
}

const mockProcessExit = vi.spyOn(process, "exit").mockImplementation((() => {
  throw new Error("process.exit called")
}) as never)

beforeEach(() => {
  vi.clearAllMocks()
  _resetPATIdentity()
  process.env["GITHUB_TOKEN"] = "ghp_test_token"
})

afterEach(() => {
  delete process.env["GITHUB_TOKEN"]
})

// ── validateAndCachePAT ───────────────────────────────────────────────────────

describe("validateAndCachePAT", () => {
  it("returns identity on success", async () => {
    mockSuccess()
    const identity = await validateAndCachePAT()
    expect(identity.login).toBe("octocat")
    expect(identity.name).toBe("The Octocat")
    expect(identity.avatarUrl).toBe("https://avatars.githubusercontent.com/u/583231")
    expect(identity.userId).toBe("42")
  })

  it("calls GitHub /user endpoint with the PAT", async () => {
    mockSuccess()
    await validateAndCachePAT()
    expect(mockGithubFetch).toHaveBeenCalledWith("ghp_test_token", "/user")
  })

  it("caches the identity so getPATIdentity() returns it", async () => {
    mockSuccess()
    await validateAndCachePAT()
    const identity = getPATIdentity()
    expect(identity.login).toBe("octocat")
  })

  it("exits when GITHUB_TOKEN is not set", async () => {
    delete process.env["GITHUB_TOKEN"]
    await expect(validateAndCachePAT()).rejects.toThrow("process.exit called")
    expect(mockProcessExit).toHaveBeenCalledWith(1)
  })

  it("exits when GitHub API call throws", async () => {
    mockGithubFetch.mockRejectedValue(new Error("network error"))
    await expect(validateAndCachePAT()).rejects.toThrow("process.exit called")
    expect(mockProcessExit).toHaveBeenCalledWith(1)
  })

  it("exits when repo scope is missing", async () => {
    mockSuccess({}, "read:user,user:email")
    await expect(validateAndCachePAT()).rejects.toThrow("process.exit called")
    expect(mockProcessExit).toHaveBeenCalledWith(1)
  })

  it("succeeds when only repo scope is granted (read:user not required)", async () => {
    mockSuccess({}, "repo")
    const identity = await validateAndCachePAT()
    expect(identity.login).toBe("octocat")
    expect(mockProcessExit).not.toHaveBeenCalled()
  })

  it("succeeds with repo + read:org (common PAT setup)", async () => {
    mockSuccess({}, "repo,read:org")
    const identity = await validateAndCachePAT()
    expect(identity.login).toBe("octocat")
    expect(mockProcessExit).not.toHaveBeenCalled()
  })

  it("does not exit when grantedScopes is null (scope header absent)", async () => {
    mockGithubFetch.mockResolvedValue({
      data: MOCK_USER,
      grantedScopes: null,
      rateLimitRemaining: null,
      rateLimitReset: null,
      status: 200,
      etag: null,
    } as never)
    const identity = await validateAndCachePAT()
    expect(identity.login).toBe("octocat")
    expect(mockProcessExit).not.toHaveBeenCalled()
  })

  it("handles null name gracefully", async () => {
    mockSuccess({ name: null })
    const identity = await validateAndCachePAT()
    expect(identity.name).toBeNull()
  })
})

// ── getPATIdentity ─────────────────────────────────────────────────────────────

describe("getPATIdentity", () => {
  it("throws when called before validateAndCachePAT", () => {
    expect(() => getPATIdentity()).toThrow("PAT identity not initialized")
  })

  it("returns the same object on subsequent calls", async () => {
    mockSuccess()
    await validateAndCachePAT()
    expect(getPATIdentity()).toBe(getPATIdentity())
  })
})
