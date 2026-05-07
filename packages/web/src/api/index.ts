import { fetchApi, fetchApiText, ApiError } from "./client.js"
import type {
  SessionUser,
  AuthConfig,
  AppConfig,
  Organization,
  Repository,
  Workflow,
  WorkflowRun,
  WorkflowJob,
  RunArtifact,
  RepositoryScore,
  SelfHostedRunner,
  RunStatus,
  RunConclusion,
} from "../types/index.js"

// ── GitHub raw shapes (private to this file) ──────────────────────────────────

interface GHUser { login: string; avatar_url: string }
interface GHOrg { login: string; avatar_url: string; description: string | null }
interface GHRepo {
  id: number; name: string; full_name: string; owner: GHUser
  private: boolean; description: string | null; default_branch: string
  pushed_at: string | null; updated_at: string; language: string | null
  stargazers_count: number; open_issues_count: number; html_url: string
  topics: string[]; visibility: string
}
interface GHWorkflow {
  id: number; name: string; path: string; state: Workflow["state"]
  created_at: string; updated_at: string; html_url: string; badge_url: string
}
interface GHRun {
  id: number; name: string | null; display_title: string
  status: RunStatus; conclusion: RunConclusion
  head_branch: string; head_sha: string; run_number: number; event: string
  workflow_id: number; path: string
  created_at: string; updated_at: string; run_started_at: string | null
  run_attempt: number; url: string; html_url: string
  actor: GHUser | null; repository: { full_name: string }
}
interface GHJob {
  id: number; name: string; status: RunStatus; conclusion: RunConclusion
  started_at: string | null; completed_at: string | null
  runner_name: string | null; labels: string[]; html_url: string
  steps: Array<{
    name: string; status: RunStatus; conclusion: RunConclusion
    number: number; started_at: string | null; completed_at: string | null
  }>
}
interface GHArtifact {
  id: number; name: string; size_in_bytes: number; expired: boolean
}
interface GHRunner {
  id: number; name: string; os: string
  status: "online" | "offline"; busy: boolean
  labels: Array<{ id: number; name: string; type: string }>
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeRepo(r: GHRepo): Repository {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    private: r.private,
    description: r.description,
    defaultBranch: r.default_branch,
    pushedAt: r.pushed_at,
    updatedAt: r.updated_at,
    language: r.language,
    stargazersCount: r.stargazers_count,
    openIssuesCount: r.open_issues_count,
    htmlUrl: r.html_url,
    topics: r.topics ?? [],
    visibility: r.visibility,
  }
}

function normalizeWorkflow(w: GHWorkflow): Workflow {
  return {
    id: w.id,
    name: w.name,
    path: w.path,
    state: w.state,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    htmlUrl: w.html_url,
    badgeUrl: w.badge_url,
  }
}

function normalizeRun(r: GHRun): WorkflowRun {
  return {
    id: r.id,
    name: r.name ?? r.display_title,
    displayTitle: r.display_title,
    status: r.status,
    conclusion: r.conclusion,
    headBranch: r.head_branch,
    headSha: r.head_sha,
    runNumber: r.run_number,
    event: r.event,
    workflowId: r.workflow_id,
    workflowPath: r.path ?? null,
    workflowName: r.name ?? "",
    repository: r.repository.full_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    runStartedAt: r.run_started_at,
    runAttempt: r.run_attempt,
    url: r.url,
    htmlUrl: r.html_url,
    actor: r.actor ? { login: r.actor.login, avatarUrl: r.actor.avatar_url } : null,
  }
}

function normalizeJob(j: GHJob): WorkflowJob {
  return {
    id: j.id,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    startedAt: j.started_at,
    completedAt: j.completed_at,
    runnerName: j.runner_name,
    labels: j.labels,
    htmlUrl: j.html_url,
    steps: j.steps.map((s) => ({
      name: s.name,
      status: s.status,
      conclusion: s.conclusion,
      number: s.number,
      startedAt: s.started_at,
      completedAt: s.completed_at,
    })),
  }
}

function normalizeRunner(r: GHRunner): SelfHostedRunner {
  return {
    id: r.id,
    name: r.name,
    os: r.os,
    status: r.status,
    busy: r.busy,
    labels: r.labels.map((l) => l.name),
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function getAuthConfig(): Promise<AuthConfig> {
  return fetchApi<AuthConfig>("/auth/config")
}

export async function getAppConfig(): Promise<AppConfig> {
  return fetchApi<AppConfig>("/api/config")
}

export async function getMe(): Promise<SessionUser> {
  return fetchApi<SessionUser>("/auth/me")
}

export async function patLogin(password: string): Promise<void> {
  await fetchApi("/auth/pat-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
}

export async function logout(): Promise<void> {
  await fetchApi("/auth/logout", { method: "POST" })
}

export async function clearServerCache(): Promise<void> {
  await fetchApi("/api/refresh", { method: "POST" })
}

// ── Organizations ─────────────────────────────────────────────────────────────

export async function getOrgs(): Promise<Organization[]> {
  const orgs = await fetchApi<GHOrg[]>("/proxy/user/orgs")
  return orgs.map((o) => ({
    login: o.login,
    avatarUrl: o.avatar_url,
    description: o.description,
  }))
}

// ── Repositories ──────────────────────────────────────────────────────────────

/**
 * Returns repositories according to server-side env config:
 *   GITHUB_REPOS=owner/repo,…  → those specific repos
 *   GITHUB_ORG=myorg           → all org repos
 *   (neither)                  → authenticated user's repos
 */
export async function getRepos(): Promise<Repository[]> {
  const repos = await fetchApi<GHRepo[]>("/api/repos")
  return repos.map(normalizeRepo)
}

export async function getUserRepos(page = 1): Promise<Repository[]> {
  const repos = await fetchApi<GHRepo[]>(
    `/proxy/user/repos?sort=pushed&per_page=100&page=${page}`
  )
  return repos.map(normalizeRepo)
}

export async function getOrgRepos(org: string, page = 1): Promise<Repository[]> {
  const repos = await fetchApi<GHRepo[]>(
    `/proxy/orgs/${org}/repos?sort=pushed&per_page=100&page=${page}`
  )
  return repos.map(normalizeRepo)
}

export async function getRepo(owner: string, repo: string): Promise<Repository> {
  const r = await fetchApi<GHRepo>(`/proxy/repos/${owner}/${repo}`)
  return normalizeRepo(r)
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function getWorkflows(owner: string, repo: string): Promise<Workflow[]> {
  try {
    const res = await fetchApi<{ workflows: GHWorkflow[] }>(
      `/proxy/repos/${owner}/${repo}/actions/workflows`
    )
    return res.workflows.map(normalizeWorkflow)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return []
    throw err
  }
}

// ── Workflow Runs ─────────────────────────────────────────────────────────────

export async function getRuns(
  owner: string,
  repo: string,
  params: { branch?: string; status?: string; per_page?: number; page?: number } = {}
): Promise<{ runs: WorkflowRun[]; total: number; actionsDisabled?: boolean }> {
  const qs = new URLSearchParams()
  if (params.branch) qs.set("branch", params.branch)
  if (params.status) qs.set("status", params.status)
  qs.set("per_page", String(params.per_page ?? 30))
  qs.set("page", String(params.page ?? 1))

  try {
    const res = await fetchApi<{ workflow_runs: GHRun[]; total_count: number }>(
      `/proxy/repos/${owner}/${repo}/actions/runs?${qs.toString()}`
    )
    return {
      runs: res.workflow_runs.map(normalizeRun),
      total: res.total_count,
    }
  } catch (err) {
    // 404 = Actions disabled or no workflows configured for this repo
    if (err instanceof ApiError && err.status === 404) {
      return { runs: [], total: 0, actionsDisabled: true }
    }
    throw err
  }
}

export async function getRun(owner: string, repo: string, runId: number): Promise<WorkflowRun> {
  const r = await fetchApi<GHRun>(`/proxy/repos/${owner}/${repo}/actions/runs/${runId}`)
  return normalizeRun(r)
}

export async function getRunJobs(owner: string, repo: string, runId: number): Promise<WorkflowJob[]> {
  const res = await fetchApi<{ jobs: GHJob[] }>(
    `/proxy/repos/${owner}/${repo}/actions/runs/${runId}/jobs`
  )
  return res.jobs.map(normalizeJob)
}

export async function getJobLogs(owner: string, repo: string, jobId: number): Promise<string> {
  return fetchApiText(`/proxy/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`)
}

export async function getRunArtifacts(owner: string, repo: string, runId: number): Promise<RunArtifact[]> {
  const res = await fetchApi<{ artifacts: GHArtifact[] }>(
    `/proxy/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`
  )
  return res.artifacts.map((a) => ({
    id: a.id,
    name: a.name,
    sizeInBytes: a.size_in_bytes,
    expired: a.expired,
  }))
}

// ── Write operations ──────────────────────────────────────────────────────────

export async function rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
  await fetchApi(`/proxy/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {
    method: "POST",
  })
}

export async function rerunFailedJobs(owner: string, repo: string, runId: number): Promise<void> {
  await fetchApi(
    `/proxy/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
    { method: "POST" }
  )
}

export async function cancelRun(owner: string, repo: string, runId: number): Promise<void> {
  await fetchApi(
    `/proxy/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
    { method: "POST" }
  )
}

export async function getRepoRunners(owner: string, repo: string): Promise<SelfHostedRunner[]> {
  const res = await fetchApi<{ runners: GHRunner[] }>(
    `/proxy/repos/${owner}/${repo}/actions/runners`
  )
  return (res.runners ?? []).map(normalizeRunner)
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export async function getRepoScore(
  owner: string,
  repo: string,
  refresh = false
): Promise<RepositoryScore> {
  const qs = refresh ? "?refresh=true" : ""
  return fetchApi<RepositoryScore>(`/api/score/${owner}/${repo}${qs}`)
}
