import { Hono } from "hono"
import { authMiddleware } from "../middleware/auth.js"
import { log } from "../lib/logger.js"
import { cacheGet, cacheSet, cacheKey, TTL } from "../lib/cache.js"
import { githubFetch, GitHubNotFoundError, GitHubApiError } from "../lib/github.js"
import type { AuthEnv } from "../middleware/auth.js"

const repos = new Hono<AuthEnv>()

repos.use("/*", authMiddleware)

/** Max pages to fetch when paginating (safety cap: 100 pages × 100 per_page = 10 000 repos). */
const MAX_PAGES = 100

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
 * Fetch all pages of a GitHub list endpoint that returns an array.
 * Stops when a page returns fewer items than per_page (last page).
 */
export async function fetchAllPages<T>(
  token: string,
  basePath: string,
  perPage = 100,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const all: T[] = []
  const separator = basePath.includes("?") ? "&" : "?"

  for (let page = 1; page <= maxPages; page++) {
    const { data } = await githubFetch<T[]>(
      token,
      `${basePath}${separator}per_page=${perPage}&page=${page}`,
    )
    all.push(...data)
    if (data.length < perPage) break
  }

  return all
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
      const cached = cacheGet<{ repos: unknown[]; errors: Array<{ repo: string; reason: string }> }>(key)
      if (cached !== undefined) {
        c.header("X-Cache", "HIT")
        return c.json(cached)
      }
      c.header("X-Cache", "MISS")

      const results = await Promise.allSettled(
        repoFilter.map((fullName) => githubFetch<unknown>(token, `/repos/${fullName}`))
      )
      const data: unknown[] = []
      const errors: Array<{ repo: string; reason: string }> = []
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          data.push(r.value.data)
        } else {
          const err = r.reason
          let reason = "Unknown error"
          if (err instanceof GitHubNotFoundError) {
            reason = "Not found or insufficient permissions"
          } else if (err instanceof GitHubApiError) {
            reason = `GitHub API error ${err.statusCode}: ${err.message}`
          } else if (err instanceof Error) {
            reason = err.message
          }
          errors.push({ repo: repoFilter[i]!, reason })
          log.warn("Failed to fetch repo from GITHUB_REPOS", {
            repo: repoFilter[i],
            error: reason,
          })
        }
      })

      log.debug("Resolved GITHUB_REPOS", {
        requested: repoFilter.length,
        resolved: data.length,
        failed: errors.length,
      })
      const result = { repos: data, errors }
      cacheSet(key, result, TTL.repos)
      return c.json(result)
    }

    if (orgFilter) {
      const key = cacheKey(session.sub, `GET:/orgs/${orgFilter}/repos`)
      const cached = cacheGet<unknown>(key)
      if (cached !== undefined) {
        c.header("X-Cache", "HIT")
        return c.json(cached)
      }
      c.header("X-Cache", "MISS")
      const data = await fetchAllPages(token, `/orgs/${orgFilter}/repos?sort=pushed`)
      const result = { repos: data, errors: [] }
      cacheSet(key, result, TTL.repos)
      return c.json(result)
    }

    // Default: authenticated user's repos
    const key = cacheKey(session.sub, "GET:/user/repos")
    const cached = cacheGet<unknown>(key)
    if (cached !== undefined) {
      c.header("X-Cache", "HIT")
      return c.json(cached)
    }
    c.header("X-Cache", "MISS")
    const data = await fetchAllPages(token, "/user/repos?sort=pushed")
    const result = { repos: data, errors: [] }
    cacheSet(key, result, TTL.repos)
    return c.json(result)
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
