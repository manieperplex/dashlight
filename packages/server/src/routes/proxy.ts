import { Hono } from "hono"
import type { Context } from "hono"
import { authMiddleware } from "../middleware/auth.js"
import { log } from "../lib/logger.js"
import {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  cacheKey,
  TTL,
  staleGet,
  staleSet,
  staleInvalidate,
} from "../lib/cache.js"
import {
  githubFetch,
  GitHubNotFoundError,
  GitHubApiError,
  GitHubRateLimitError,
} from "../lib/github.js"
import type { AuthEnv } from "../middleware/auth.js"

const proxy = new Hono<AuthEnv>()

proxy.use("/*", authMiddleware)

/**
 * In-flight request coalescing: prevents thundering-herd cache-miss storms.
 * When multiple concurrent requests arrive for the same key (user + path),
 * only one GitHub fetch is issued; the rest await the same promise.
 */
const inFlight = new Map<string, Promise<{ data: unknown; rateLimitRemaining: number | null }>>()

/**
 * Write deduplication: prevents double-firing from rapid duplicate clicks.
 * A POST/PATCH/DELETE for the same user + method + path is rejected with 409
 * while an identical request is already in flight.
 */
const writeInFlight = new Set<string>()

/**
 * Extract the GitHub API path from the incoming request.
 * c.req.param("*") is undefined in Hono sub-apps mounted with app.route(),
 * so we derive the path from c.req.url instead.
 * e.g. /proxy/repos/owner/repo/actions/runs  →  /repos/owner/repo/actions/runs
 */
function githubPath(c: Context<AuthEnv>): string {
  const url = new URL(c.req.url, "http://localhost")
  // Strip the /proxy mount prefix
  return url.pathname.replace(/^\/proxy/, "") || "/"
}

// GET — job logs: GitHub returns 302 to a signed S3 URL; follow and return as plain text
proxy.get("/repos/:owner/:repo/actions/jobs/:jobId/logs", async (c) => {
  const path = githubPath(c)
  const session = c.get("session")
  const token = c.get("githubToken")

  const key = cacheKey(session.sub, `GET:${path}`)
  const cached = cacheGet<string>(key)
  if (cached !== undefined) {
    c.header("X-Cache", "HIT")
    return c.text(cached)
  }

  c.header("X-Cache", "MISS")
  try {
    const { data } = await githubFetch<string>(token, path, { followRedirect: true })
    cacheSet(key, data, TTL.logs)
    return c.text(data)
  } catch (err) {
    return handleGitHubError(c, err)
  }
})

// GET — cached proxy with ETag revalidation and request coalescing
proxy.get("/*", async (c) => {
  const path = githubPath(c)
  const url = new URL(c.req.url, "http://localhost")
  const fullPath = url.search ? `${path}${url.search}` : path
  const session = c.get("session")
  const token = c.get("githubToken")

  const key = cacheKey(session.sub, `GET:${fullPath}`)
  const cached = cacheGet<unknown>(key)

  if (cached !== undefined) {
    c.header("X-Cache", "HIT")
    return c.json(cached)
  }

  c.header("X-Cache", "MISS")

  // Coalesce: reuse an in-flight fetch for the same user+path
  let pending = inFlight.get(key)
  if (!pending) {
    pending = fetchAndCache(token, fullPath, key, path)
    inFlight.set(key, pending)
    pending.finally(() => inFlight.delete(key)).catch(() => undefined)
  }

  try {
    const { data, rateLimitRemaining } = await pending
    if (rateLimitRemaining !== null) {
      c.header("X-RateLimit-Remaining", String(rateLimitRemaining))
    }
    return c.json(data)
  } catch (err) {
    return handleGitHubError(c, err)
  }
})

/**
 * Perform a GitHub fetch with ETag-based conditional revalidation.
 * On 304, restores data from the stale store instead of re-downloading.
 */
async function fetchAndCache(
  token: string,
  fullPath: string,
  key: string,
  path: string,
): Promise<{ data: unknown; rateLimitRemaining: number | null }> {
  const stale = staleGet(key)

  const result = await githubFetch<unknown>(token, fullPath, {
    ...(stale?.etag != null && { etag: stale.etag }),
  })

  if (result.status === 304 && stale) {
    // Free conditional hit — restore stale data into the live cache
    cacheSet(key, stale.data, resolveTtl(path))
    return { data: stale.data, rateLimitRemaining: result.rateLimitRemaining }
  }

  const ttl = resolveTtl(path)
  cacheSet(key, result.data, ttl)
  staleSet(key, result.data, result.etag)

  return { data: result.data, rateLimitRemaining: result.rateLimitRemaining }
}

// POST — pass-through (no cache), with cache invalidation for rerun/cancel
proxy.post("/*", async (c) => {
  const path = githubPath(c)
  const session = c.get("session")
  const token = c.get("githubToken")

  const writeKey = `${session.sub}:POST:${path}`
  if (writeInFlight.has(writeKey)) {
    return c.json({ error: "Duplicate request already in flight" }, 409)
  }
  writeInFlight.add(writeKey)

  let body: unknown
  try {
    const text = await c.req.text()
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }

  try {
    const { data } = await githubFetch<unknown>(token, path, { method: "POST", body })
    invalidateOnWrite(session.sub, path)
    return c.json(data)
  } catch (err) {
    return handleGitHubError(c, err)
  } finally {
    writeInFlight.delete(writeKey)
  }
})

// DELETE — pass-through (no cache), with cache invalidation
proxy.delete("/*", async (c) => {
  const path = githubPath(c)
  const session = c.get("session")
  const token = c.get("githubToken")

  const writeKey = `${session.sub}:DELETE:${path}`
  if (writeInFlight.has(writeKey)) {
    return c.json({ error: "Duplicate request already in flight" }, 409)
  }

  writeInFlight.add(writeKey)
  try {
    const { data } = await githubFetch<unknown>(token, path, { method: "DELETE" })
    invalidateOnWrite(session.sub, path)
    return c.json(data)
  } catch (err) {
    return handleGitHubError(c, err)
  } finally {
    writeInFlight.delete(writeKey)
  }
})

// PATCH — pass-through with cache invalidation
proxy.patch("/*", async (c) => {
  const path = githubPath(c)
  const session = c.get("session")
  const token = c.get("githubToken")

  const writeKey = `${session.sub}:PATCH:${path}`
  if (writeInFlight.has(writeKey)) {
    return c.json({ error: "Duplicate request already in flight" }, 409)
  }
  writeInFlight.add(writeKey)

  let body: unknown
  try {
    const text = await c.req.text()
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }

  try {
    const { data } = await githubFetch<unknown>(token, path, { method: "PATCH", body })
    invalidateOnWrite(session.sub, path)
    return c.json(data)
  } catch (err) {
    return handleGitHubError(c, err)
  } finally {
    writeInFlight.delete(writeKey)
  }
})

function resolveTtl(path: string): number {
  if (path.startsWith("/user/orgs")) return TTL.orgs
  if (path.startsWith("/user/repos") || path.match(/\/orgs\/[^/]+\/repos/)) return TTL.repos
  if (path.match(/\/repos\/[^/]+\/[^/]+\/actions\/workflows($|\/[^/]+\/runs)/)) return TTL.workflows
  if (path.match(/\/repos\/[^/]+\/[^/]+\/actions\/runs\/[^/]+\/jobs/)) return TTL.jobs
  if (path.match(/\/repos\/[^/]+\/[^/]+\/actions\/runs/)) return TTL.runs
  if (path.match(/\/repos\/[^/]+\/[^/]+\/check-runs/)) return TTL.annotations
  if (path.match(/\/repos\/[^/]+\/[^/]+\/git\/trees/)) return TTL.yaml
  if (path.match(/\/repos\/[^/]+\/[^/]+\/actions\/jobs\/[^/]+\/logs/)) return TTL.logs
  if (path.match(/\/repos\/[^/]+\/[^/]+\/actions\/runners/)) return TTL.runners
  if (
    path.match(/\/repos\/[^/]+\/[^/]+\/community\/profile/) ||
    path.match(/\/repos\/[^/]+\/[^/]+\/branches\/[^/]+\/protection/)
  ) return TTL.score
  log.debug("resolveTtl: no pattern matched, using default TTL", { path })
  return TTL.default
}

/**
 * Invalidate all cache entries that may be stale after a write (POST/PATCH/DELETE).
 * Clears runs, jobs, workflows, and the computed score for the affected repo.
 */
function invalidateOnWrite(userId: string, path: string): void {
  const repoMatch = path.match(/^\/repos\/([^/]+\/[^/]+)/)
  if (repoMatch?.[1]) {
    const repoPath = repoMatch[1]
    cacheInvalidate(userId, `GET:/repos/${repoPath}/actions/runs`)
    cacheInvalidate(userId, `GET:/repos/${repoPath}/actions/jobs`)
    cacheInvalidate(userId, `GET:/repos/${repoPath}/actions/workflows`)
    cacheInvalidate(userId, `score:${repoPath}`)
    staleInvalidate(userId, `GET:/repos/${repoPath}/actions/runs`)
    staleInvalidate(userId, `GET:/repos/${repoPath}/actions/jobs`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleGitHubError(c: any, err: unknown) {
  if (err instanceof GitHubRateLimitError) {
    // resetAt is a Unix timestamp (seconds); compute seconds until reset
    const retryAfter = err.resetAt != null
      ? Math.max(Math.ceil(err.resetAt - Date.now() / 1000), 0)
      : 3600
    c.header("Retry-After", String(retryAfter))
    return c.json({ error: "GitHub API rate limit exceeded" }, 503)
  }
  if (err instanceof GitHubNotFoundError) {
    return c.json({ error: "Not found" }, 404)
  }
  if (err instanceof GitHubApiError) {
    return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 422 | 500)
  }
  log.error("Unexpected proxy error", { error: String(err) })
  return c.json({ error: "Internal server error" }, 500)
}

export default proxy
