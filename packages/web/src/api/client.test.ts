import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchApi, fetchApiText, ApiError } from "./client.js"

function mockFetch(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("ApiError", () => {
  it("stores status and message", () => {
    const err = new ApiError("Not found", 404, { error: "Not found" })
    expect(err.message).toBe("Not found")
    expect(err.status).toBe(404)
    expect(err.name).toBe("ApiError")
  })

  it("body is optional", () => {
    const err = new ApiError("Oops", 500)
    expect(err.body).toBeUndefined()
  })
})

describe("fetchApi", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { id: 1 }))
    const result = await fetchApi<{ id: number }>("/api/repos")
    expect(result).toEqual({ id: 1 })
  })

  it("sends credentials: include", async () => {
    const spy = mockFetch(200, {})
    vi.stubGlobal("fetch", spy)
    await fetchApi("/api/test")
    expect(spy).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      credentials: "include",
    }))
  })

  it("merges Content-Type header", async () => {
    const spy = mockFetch(200, {})
    vi.stubGlobal("fetch", spy)
    await fetchApi("/api/test")
    const [, opts] = spy.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json")
  })

  it("returns null for 204 No Content", async () => {
    vi.stubGlobal("fetch", mockFetch(204, null))
    const result = await fetchApi("/api/runs/1/cancel")
    expect(result).toBeNull()
  })

  it("throws ApiError on non-ok response with error field", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { error: "Not found" }, false))
    await expect(fetchApi("/api/repos/x")).rejects.toThrow(ApiError)
    await expect(fetchApi("/api/repos/x")).rejects.toThrow("Not found")
  })

  it("throws ApiError with HTTP status fallback when no error field", async () => {
    vi.stubGlobal("fetch", mockFetch(500, {}, false))
    await expect(fetchApi("/api/repos")).rejects.toThrow("HTTP 500")
  })

  it("throws ApiError with correct status code", async () => {
    vi.stubGlobal("fetch", mockFetch(403, { error: "Forbidden" }, false))
    try {
      await fetchApi("/api/repos")
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).status).toBe(403)
    }
  })

  it("passes through custom options to fetch", async () => {
    const spy = mockFetch(200, {})
    vi.stubGlobal("fetch", spy)
    await fetchApi("/api/runs", { method: "POST" })
    const [, opts] = spy.mock.calls[0] as [string, RequestInit]
    expect(opts.method).toBe("POST")
  })
})

describe("fetchApiText", () => {
  it("returns response text on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, "log output here"))
    const result = await fetchApiText("/api/logs")
    expect(result).toBe("log output here")
  })

  it("throws ApiError on failure", async () => {
    vi.stubGlobal("fetch", mockFetch(404, "not found", false))
    await expect(fetchApiText("/api/logs")).rejects.toThrow(ApiError)
    await expect(fetchApiText("/api/logs")).rejects.toThrow("HTTP 404")
  })
})
