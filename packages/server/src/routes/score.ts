import { Hono } from "hono"
import { authMiddleware } from "../middleware/auth.js"
import { cacheGet, cacheSet, cacheKey, TTL } from "../lib/cache.js"
import { githubFetch, GitHubNotFoundError } from "../lib/github.js"
import { computeScore } from "../lib/scorer.js"
import type { AuthEnv } from "../middleware/auth.js"
import type {
  GitHubRepo,
  GitHubWorkflow,
  GitHubWorkflowRun,
  ScorerInput,
} from "../lib/scorer.js"

const score = new Hono<AuthEnv>()

score.use("/*", authMiddleware)

score.get("/:owner/:repo", async (c) => {
  const owner = c.req.param("owner")
  const repo = c.req.param("repo")
  const forceRefresh = c.req.query("refresh") === "true"
  const token = c.get("githubToken")
  const userId = c.get("session").sub

  const key = cacheKey(userId, `score:${owner}/${repo}`)

  if (!forceRefresh) {
    const cached = cacheGet<ReturnType<typeof computeScore>>(key)
    if (cached) {
      c.header("X-Cache", "HIT")
      return c.json(cached)
    }
  }

  c.header("X-Cache", "MISS")

  // Fetch repo first (sequential) to get default_branch for branch protection.
  let repoData: GitHubRepo
  try {
    const repoResult = await githubFetch<GitHubRepo>(token, `/repos/${owner}/${repo}`)
    repoData = repoResult.data
  } catch (err) {
    if (err instanceof GitHubNotFoundError) {
      return c.json({ error: "Repository not found" }, 404)
    }
    return c.json({ error: "Failed to fetch repository data" }, 502)
  }

  // Run the remaining calls in parallel
  const [
    workflowsResult,
    runsResult,
    readmeResult,
    dependabotResult,
    securityPolicyResult,
  ] = await Promise.allSettled([
    githubFetch<{ workflows: GitHubWorkflow[] }>(token, `/repos/${owner}/${repo}/actions/workflows`),
    githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
      token,
      `/repos/${owner}/${repo}/actions/runs?per_page=30`
    ),
    githubFetch<object>(token, `/repos/${owner}/${repo}/contents/README.md`),
    githubFetch<object>(token, `/repos/${owner}/${repo}/contents/.github/dependabot.yml`),
    githubFetch<object>(token, `/repos/${owner}/${repo}/contents/SECURITY.md`),
  ])

  const workflows =
    workflowsResult.status === "fulfilled"
      ? workflowsResult.value.data.workflows
      : []

  const recentRuns =
    runsResult.status === "fulfilled"
      ? runsResult.value.data.workflow_runs
      : []

  const hasReadme = readmeResult.status === "fulfilled"
  const hasDependabot = dependabotResult.status === "fulfilled"
  const hasSecurityPolicy = securityPolicyResult.status === "fulfilled"

  // Reuse the already-fetched workflows list for CodeQL detection — no extra call needed
  const hasCodeql = workflows.some(
    (w) => /codeql|code.?ql/i.test(w.name) || w.path.includes("codeql")
  )

  const input: ScorerInput = {
    owner,
    repo,
    repoData,
    workflows,
    recentRuns,
    hasReadme,
    hasDependabot,
    hasCodeql,
    hasSecurityPolicy,
  }

  const result = computeScore(input)
  cacheSet(key, result, TTL.score)

  return c.json(result)
})

export default score
