import { describe, it, expect, vi, beforeEach } from "vitest"
import { githubFetch, GitHubApiError, GitHubNotFoundError, GitHubRateLimitError } from "./github.js"

// Mock undici at the module level
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>()
  return {
    ...actual,
    request: vi.fn(),
  }
})

// Mock certs so no real network/file access happens
vi.mock("./certs.js", () => ({
  buildUndiciAgent: () => ({}),
  caCert: undefined,
  logCertStatus: () => {},
}))

import { request } from "undici"

const mockRequest = vi.mocked(request)

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    statusCode: status,
    headers: {
      "x-ratelimit-remaining": "59",
      "x-ratelimit-reset": "1700000000",
      ...headers,
    },
    body: {
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("githubFetch", () => {
  it("returns parsed JSON data on 200", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, { id: 1, name: "repo" }) as never)

    const result = await githubFetch<{ id: number; name: string }>("token123", "/repos/owner/repo")
    expect(result.data).toEqual({ id: 1, name: "repo" })
    expect(result.status).toBe(200)
  })

  it("includes rate limit info from headers", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, {}, {
      "x-ratelimit-remaining": "42",
      "x-ratelimit-reset": "1700000001",
    }) as never)

    const result = await githubFetch("token", "/user")
    expect(result.rateLimitRemaining).toBe(42)
    expect(result.rateLimitReset).toBe(1700000001)
  })

  it("returns null data on 204 No Content", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 204,
      headers: {},
      body: { text: () => Promise.resolve("") },
    } as never)

    const result = await githubFetch("token", "/repos/owner/repo/actions/runs/1/cancel")
    expect(result.data).toBeNull()
    expect(result.status).toBe(204)
  })

  it("throws GitHubNotFoundError on 404", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(404, { message: "Not Found" }) as never
    )

    await expect(githubFetch("token", "/repos/nobody/nothing"))
      .rejects.toThrow(GitHubNotFoundError)
  })

  it("throws GitHubApiError on 403", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(403, { message: "Forbidden" }) as never
    )

    await expect(githubFetch("token", "/repos/owner/private"))
      .rejects.toThrow(GitHubApiError)
  })

  it("uses the message from the GitHub error body", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(422, { message: "Validation Failed" }) as never
    )

    await expect(githubFetch("token", "/repos/owner/repo"))
      .rejects.toThrow("Validation Failed")
  })

  it("retries on 503 and succeeds on second attempt", async () => {
    mockRequest
      .mockResolvedValueOnce(makeResponse(503, "") as never)
      .mockResolvedValueOnce(makeResponse(200, { ok: true }) as never)

    const result = await githubFetch<{ ok: boolean }>("token", "/repos/owner/repo")
    expect(result.data).toEqual({ ok: true })
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it("throws GitHubRateLimitError immediately on 429 (no retry)", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(429, "", { "x-ratelimit-reset": "1700009000" }) as never
    )

    await expect(githubFetch("token", "/repos")).rejects.toThrow(GitHubRateLimitError)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("stores resetAt from x-ratelimit-reset header in GitHubRateLimitError", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(429, "", { "x-ratelimit-reset": "1700009999" }) as never
    )

    const err = await githubFetch("token", "/repos").catch((e) => e)
    expect(err).toBeInstanceOf(GitHubRateLimitError)
    expect((err as GitHubRateLimitError).resetAt).toBe(1700009999)
  })

  it("throws after exhausting all retries", async () => {
    mockRequest.mockResolvedValue(makeResponse(503, "") as never)

    await expect(githubFetch("token", "/repos/owner/repo")).rejects.toThrow()
    // initial attempt + 3 retries = 4 calls
    expect(mockRequest).toHaveBeenCalledTimes(4)
  })

  it("sends POST with JSON body", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, { queued: true }) as never)

    await githubFetch("token", "/repos/owner/repo/actions/runs/1/rerun", {
      method: "POST",
      body: { enable_debug_logging: false },
    })

    const callArgs = mockRequest.mock.calls[0]![1] as Record<string, unknown>
    expect(callArgs["method"]).toBe("POST")
    expect(callArgs["body"]).toBe('{"enable_debug_logging":false}')
  })

  it("sends null body for requests without body", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, {}) as never)

    await githubFetch("token", "/user", { method: "GET" })

    const callArgs = mockRequest.mock.calls[0]![1] as Record<string, unknown>
    expect(callArgs["body"]).toBeNull()
  })

  it("includes required GitHub API headers", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, {}) as never)

    await githubFetch("my-token", "/user")

    const callArgs = mockRequest.mock.calls[0]![1] as Record<string, unknown>
    const headers = callArgs["headers"] as Record<string, string>
    expect(headers["Authorization"]).toBe("Bearer my-token")
    expect(headers["Accept"]).toBe("application/vnd.github+json")
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28")
  })
})

describe("GitHubApiError", () => {
  it("stores status code", () => {
    const err = new GitHubApiError("Forbidden", 403)
    expect(err.statusCode).toBe(403)
    expect(err.message).toBe("Forbidden")
    expect(err.name).toBe("GitHubApiError")
  })
})

describe("GitHubNotFoundError", () => {
  it("is a GitHubApiError with 404 status", () => {
    const err = new GitHubNotFoundError("Not found")
    expect(err).toBeInstanceOf(GitHubApiError)
    expect(err.statusCode).toBe(404)
    expect(err.name).toBe("GitHubNotFoundError")
  })
})

describe("GitHubRateLimitError", () => {
  it("is a GitHubApiError with 429 status", () => {
    const err = new GitHubRateLimitError(1700000000)
    expect(err).toBeInstanceOf(GitHubApiError)
    expect(err.statusCode).toBe(429)
    expect(err.name).toBe("GitHubRateLimitError")
    expect(err.resetAt).toBe(1700000000)
  })

  it("accepts null resetAt", () => {
    const err = new GitHubRateLimitError(null)
    expect(err.resetAt).toBeNull()
  })
})

describe("followRedirect", () => {
  it("follows 302 redirect and returns response body as raw text", async () => {
    const logText = "2024-01-01T10:00:00.000Z step 1\n2024-01-01T10:00:01.000Z step 2\n"
    mockRequest
      .mockResolvedValueOnce(makeResponse(302, "", { location: "https://s3.example.com/logs/signed" }) as never)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: { text: () => Promise.resolve(logText) },
      } as never)

    const result = await githubFetch<string>("token", "/repos/owner/repo/actions/jobs/1/logs", {
      followRedirect: true,
    })
    expect(result.data).toBe(logText)
    expect(result.status).toBe(200)
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it("throws GitHubApiError when 302 is received without followRedirect", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(302, "", { location: "https://s3.example.com/logs/signed" }) as never
    )

    await expect(
      githubFetch("token", "/repos/owner/repo/actions/jobs/1/logs")
    ).rejects.toThrow(GitHubApiError)
  })
})

describe("ETag support", () => {
  it("sends If-None-Match header when etag option is provided", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, { ok: true }) as never)

    await githubFetch("token", "/repos/owner/repo", { etag: '"abc123"' })

    const callArgs = mockRequest.mock.calls[0]![1] as Record<string, unknown>
    const headers = callArgs["headers"] as Record<string, string>
    expect(headers["If-None-Match"]).toBe('"abc123"')
  })

  it("does not send If-None-Match when no etag is provided", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, {}) as never)

    await githubFetch("token", "/repos/owner/repo")

    const callArgs = mockRequest.mock.calls[0]![1] as Record<string, unknown>
    const headers = callArgs["headers"] as Record<string, string>
    expect(headers["If-None-Match"]).toBeUndefined()
  })

  it("returns etag from response headers", async () => {
    mockRequest.mockResolvedValueOnce(
      makeResponse(200, { id: 1 }, { etag: '"xyz789"' }) as never
    )

    const result = await githubFetch("token", "/repos/owner/repo")
    expect(result.etag).toBe('"xyz789"')
  })

  it("returns null etag when header is absent", async () => {
    mockRequest.mockResolvedValueOnce(makeResponse(200, { id: 1 }) as never)

    const result = await githubFetch("token", "/repos/owner/repo")
    expect(result.etag).toBeNull()
  })

  it("returns status 304 with null data and provided etag on conditional hit", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 304,
      headers: { "x-ratelimit-remaining": "58", "x-ratelimit-reset": "1700000000" },
      body: { text: () => Promise.resolve("") },
    } as never)

    const result = await githubFetch("token", "/repos/owner/repo", { etag: '"abc"' })
    expect(result.status).toBe(304)
    expect(result.data).toBeNull()
    expect(result.etag).toBe('"abc"')
  })
})
