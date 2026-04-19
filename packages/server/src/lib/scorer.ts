// Scoring logic — 5 categories, 22 checks
// Gold >= 90, Silver >= 70, Bronze >= 0

export type ScoreTier = "gold" | "silver" | "bronze"

export interface CheckResult {
  name: string
  passed: boolean
  value?: string | number | boolean
  weight: number
}

export interface ScoreCategory {
  name: string
  score: number        // 0–100 within category
  maxScore: number     // always 100
  weight: number       // contribution weight to overall score
  checks: CheckResult[]
}

export interface RepositoryScore {
  owner: string
  repo: string
  overall: number      // 0–100 weighted
  tier: ScoreTier
  categories: ScoreCategory[]
  computedAt: string
}

// ── GitHub API response shapes (input to scorer) ─────────────────────────────

export interface GitHubRepo {
  default_branch: string
  has_issues: boolean
  has_wiki: boolean
  has_discussions: boolean
  open_issues_count: number
  pushed_at: string | null
  topics: string[]
  visibility: string
  license: { spdx_id: string } | null
  stargazers_count: number
}

export interface GitHubWorkflow {
  id: number
  name: string
  state: string
  path: string
}

export interface GitHubWorkflowRun {
  id: number
  status: string
  conclusion: string | null
  head_branch: string
  created_at: string
  run_attempt: number
}

export interface ScorerInput {
  owner: string
  repo: string
  repoData: GitHubRepo
  workflows: GitHubWorkflow[]
  recentRuns: GitHubWorkflowRun[]   // last 30 runs
  hasReadme: boolean
  hasDependabot: boolean
  hasCodeql: boolean
  hasSecurityPolicy: boolean
}

// ── Category scorers ──────────────────────────────────────────────────────────

function scoreCiWorkflows(input: ScorerInput): ScoreCategory {
  const activeWorkflows = input.workflows.filter((w) => w.state === "active")
  const hasTestWorkflow = activeWorkflows.some(
    (w) => /test|spec|ci|check/i.test(w.name) || /test|spec|ci/i.test(w.path)
  )
  const hasReleaseWorkflow = activeWorkflows.some(
    (w) => /release|deploy|publish/i.test(w.name) || /release|deploy|publish/i.test(w.path)
  )
  const hasDependencyUpdate = activeWorkflows.some(
    (w) => /dependabot|renovate/i.test(w.name)
  )
  const checks: CheckResult[] = [
    { name: "Has active workflows", passed: activeWorkflows.length > 0, value: activeWorkflows.length, weight: 25 },
    { name: "Has test/CI workflow", passed: hasTestWorkflow, weight: 30 },
    { name: "Has release/deploy workflow", passed: hasReleaseWorkflow, weight: 20 },
    { name: "Multiple workflows (>= 2)", passed: activeWorkflows.length >= 2, weight: 15 },
    { name: "Has dependency update workflow", passed: hasDependencyUpdate || input.hasDependabot, weight: 10 },
  ]
  return buildCategory("CI/CD Workflows", checks, 20)
}

// Conclusions that are intentional or infrastructural — excluded from success-rate
// denominator because they don't reflect build quality.
const NEUTRAL_CONCLUSIONS = new Set(["cancelled", "skipped", "neutral", "stale"])

function scoreBuildSuccess(input: ScorerInput): ScoreCategory {
  // Only count runs that reached a definitive pass/fail outcome
  const completed = input.recentRuns.filter(
    (r) =>
      r.status === "completed" &&
      r.conclusion !== null &&
      !NEUTRAL_CONCLUSIONS.has(r.conclusion)
  )
  const successful = completed.filter((r) => r.conclusion === "success")
  const rate = completed.length > 0 ? successful.length / completed.length : 0
  const hasRecentRuns = completed.length > 0
  const ratePercent = Math.round(rate * 100)

  // Check flakiness: completed runs that required a retry
  const flaky = completed.filter((r) => r.run_attempt > 1).length
  const flakyRatio = completed.length > 0 ? flaky / completed.length : 0

  const checks: CheckResult[] = [
    { name: "Has recent runs", passed: hasRecentRuns, value: input.recentRuns.length, weight: 10 },
    { name: "Success rate >= 80%", passed: rate >= 0.8, value: `${ratePercent}%`, weight: 35 },
    { name: "Success rate >= 90%", passed: rate >= 0.9, value: `${ratePercent}%`, weight: 25 },
    { name: "Success rate >= 95%", passed: rate >= 0.95, value: `${ratePercent}%`, weight: 20 },
    { name: "Low flakiness (< 10% reruns)", passed: flakyRatio < 0.1, value: `${Math.round(flakyRatio * 100)}%`, weight: 10 },
  ]
  return buildCategory("Build Success Rate", checks, 25)
}

function scoreSecurity(input: ScorerInput): ScoreCategory {
  const checks: CheckResult[] = [
    { name: "Has Dependabot", passed: input.hasDependabot, weight: 35 },
    { name: "Has CodeQL analysis", passed: input.hasCodeql, weight: 35 },
    { name: "Private repo or has license", passed: input.repoData.visibility === "private" || !!input.repoData.license, weight: 15 },
    { name: "Has security policy (SECURITY.md)", passed: input.hasSecurityPolicy, weight: 15 },
  ]
  return buildCategory("Security Practices", checks, 15)
}

function scoreDocumentation(input: ScorerInput): ScoreCategory {
  const checks: CheckResult[] = [
    { name: "Has README", passed: input.hasReadme, weight: 40 },
    { name: "Has topics/tags", passed: (input.repoData.topics?.length ?? 0) > 0, value: input.repoData.topics?.length, weight: 20 },
    { name: "Has wiki or discussions", passed: input.repoData.has_wiki || input.repoData.has_discussions, weight: 20 },
    { name: "Has license in repo", passed: !!input.repoData.license, ...(input.repoData.license?.spdx_id ? { value: input.repoData.license.spdx_id } : {}), weight: 20 },
  ]
  return buildCategory("Documentation", checks, 5)
}

function scoreMaintenance(input: ScorerInput): ScoreCategory {
  const pushedAt = input.repoData.pushed_at ? new Date(input.repoData.pushed_at) : null
  const now = new Date()
  const daysSincePush = pushedAt ? (now.getTime() - pushedAt.getTime()) / (1000 * 60 * 60 * 24) : 999
  const openIssues = input.repoData.open_issues_count

  const checks: CheckResult[] = [
    { name: "Pushed within 30 days", passed: daysSincePush <= 30, value: Math.round(daysSincePush), weight: 35 },
    { name: "Pushed within 90 days", passed: daysSincePush <= 90, value: Math.round(daysSincePush), weight: 25 },
    { name: "Open issues/PRs < 100", passed: openIssues < 100, value: openIssues, weight: 20 },
    { name: "Has issue tracking enabled", passed: input.repoData.has_issues, weight: 20 },
  ]
  return buildCategory("Maintenance", checks, 5)
}

// ── Builder helpers ───────────────────────────────────────────────────────────

function buildCategory(name: string, checks: CheckResult[], weight: number): ScoreCategory {
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0)
  const earnedWeight = checks
    .filter((c) => c.passed)
    .reduce((sum, c) => sum + c.weight, 0)

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  return { name, score, maxScore: 100, weight, checks }
}

function tierFromScore(score: number): ScoreTier {
  if (score >= 90) return "gold"
  if (score >= 70) return "silver"
  return "bronze"
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeScore(input: ScorerInput): RepositoryScore {
  const categories = [
    scoreBuildSuccess(input),
    scoreCiWorkflows(input),
    scoreDocumentation(input),
    scoreMaintenance(input),
    scoreSecurity(input),
  ]

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0)
  const weightedScore = categories.reduce(
    (sum, c) => sum + (c.score * c.weight) / totalWeight,
    0
  )
  const overall = Math.round(weightedScore)

  return {
    owner: input.owner,
    repo: input.repo,
    overall,
    tier: tierFromScore(overall),
    categories,
    computedAt: new Date().toISOString(),
  }
}
