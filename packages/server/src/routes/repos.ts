import { Hono } from "hono"
import { authMiddleware } from "../middleware/auth.js"
import { log } from "../lib/logger.js"
import { cacheGet, cacheSet, cacheKey, TTL } from "../lib/cache.js"
import { githubFetch, GitHubNotFoundError, GitHubApiError } from "../lib/github.js"
import type { AuthEnv } from "../middleware/auth.js"

const repos = new Hono<AuthEnv>()

repos.use("/*", authMiddleware)

function getRepoFilter(): string[] | null {
  const raw = process.env["GITHUB_REPOS"]
  if (!raw?.trim()) return null
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

function getOrgFilter(): string | null {
  const raw = process.env["GITHUB_ORG"]
  return raw?.trim() || null
}

/**
 * GET /api/repos
 * Returns repositories scoped by env config:
 *   GITHUB_REPOS=owner/repo,owner/repo2  → fetch those specific repos
 *   GITHUB_ORG=myorg                      → fetch all org repos
 *   (neither set)                         → fetch authenticated user's repos
 */
repos.get("/", async (c) => {
  const session = c.get("session")
  const token = c.get("githubToken")
  const repoFilter = getRepoFilter()
  const orgFilter = getOrgFilter()

  try {
    if (repoFilter) {
      const key = cacheKey(session.sub, "GET:/api/repos:explicit")
      const cached = cacheGet<unknown[]>(key)
      if (cached !== undefined) {
        c.header("X-Cache", "HIT")
        return c.json(cached)
      }
      c.header("X-Cache", "MISS")

      const results = await Promise.allSettled(
        repoFilter.map((fullName) => githubFetch<unknown>(token, `/repos/${fullName}`))
      )
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          log.warn("Failed to fetch repo from GITHUB_REPOS", {
            repo: repoFilter[i],
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          })
        }
      })
      const data = results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof githubFetch<unknown>>>> =>
          r.status === "fulfilled"
        )
        .map((r) => r.value.data)

      log.debug("Resolved GITHUB_REPOS", {
        requested: repoFilter,
        resolved: data.length,
      })
      cacheSet(key, data, TTL.repos)
      return c.json(data)
    }

    if (orgFilter) {
      const key = cacheKey(session.sub, `GET:/orgs/${orgFilter}/repos`)
      const cached = cacheGet<unknown>(key)
      if (cached !== undefined) {
        c.header("X-Cache", "HIT")
        return c.json(cached)
      }
      c.header("X-Cache", "MISS")
      const { data } = await githubFetch<unknown>(token, `/orgs/${orgFilter}/repos?sort=pushed&per_page=100`)
      cacheSet(key, data, TTL.repos)
      return c.json(data)
    }

    // Default: authenticated user's repos
    const key = cacheKey(session.sub, "GET:/user/repos")
    const cached = cacheGet<unknown>(key)
    if (cached !== undefined) {
      c.header("X-Cache", "HIT")
      return c.json(cached)
    }
    c.header("X-Cache", "MISS")
    const { data } = await githubFetch<unknown>(token, "/user/repos?sort=pushed&per_page=100")
    cacheSet(key, data, TTL.repos)
    return c.json(data)
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return c.json({ error: "Not found" }, 404)
    if (err instanceof GitHubApiError) {
      return c.json({ error: err.message }, err.statusCode as 400 | 401 | 403 | 422 | 500)
    }
    log.error("Unexpected repos error", { error: String(err) })
    return c.json({ error: "Internal server error" }, 500)
  }
})

export default repos
