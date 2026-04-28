// ── Primitives ────────────────────────────────────────────────────────────────

export type RunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending"

export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | null

export type ScoreTier = "gold" | "silver" | "bronze"

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface SessionUser {
  login: string
  name: string
  avatarUrl: string
}

export interface AuthConfig {
  mode: "oauth" | "pat"
  passwordRequired: boolean
}

// ── GitHub domain types ───────────────────────────────────────────────────────

export interface GitHubUser {
  login: string
  avatarUrl: string
}

export interface Organization {
  login: string
  avatarUrl: string
  description: string | null
}

export interface Repository {
  id: number
  name: string
  fullName: string
  owner: string
  private: boolean
  description: string | null
  defaultBranch: string
  pushedAt: string | null
  updatedAt: string
  language: string | null
  stargazersCount: number
  openIssuesCount: number
  htmlUrl: string
  topics: string[]
  visibility: string
}

export interface Workflow {
  id: number
  name: string
  path: string
  state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually"
  createdAt: string
  updatedAt: string
  htmlUrl: string
  badgeUrl: string
}

export interface WorkflowRun {
  id: number
  name: string
  status: RunStatus
  conclusion: RunConclusion
  headBranch: string
  headSha: string
  runNumber: number
  event: string
  workflowId: number
  workflowPath: string | null   // e.g. ".github/workflows/ci.yml"
  workflowName: string
  repository: string   // "owner/repo"
  createdAt: string
  updatedAt: string
  runStartedAt: string | null
  runAttempt: number
  url: string
  htmlUrl: string
  actor: GitHubUser | null
  displayTitle: string
}

export interface JobStep {
  name: string
  status: RunStatus
  conclusion: RunConclusion
  number: number
  startedAt: string | null
  completedAt: string | null
}

export interface WorkflowJob {
  id: number
  name: string
  status: RunStatus
  conclusion: RunConclusion
  startedAt: string | null
  completedAt: string | null
  steps: JobStep[]
  runnerName: string | null
  labels: string[]
  htmlUrl: string
}

export interface RunArtifact {
  id: number
  name: string
  sizeInBytes: number
  expired: boolean
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string
  passed: boolean
  value?: string | number | boolean
  weight: number
}

export interface ScoreCategory {
  name: string
  score: number       // 0–100
  maxScore: number    // 100
  weight: number
  checks: CheckResult[]
}

export interface RepositoryScore {
  owner: string
  repo: string
  overall: number     // 0–100
  tier: ScoreTier
  categories: ScoreCategory[]
  computedAt: string
}

// ── Derived / view models ─────────────────────────────────────────────────────

export interface RunSummary {
  total: number
  success: number
  failure: number
  inProgress: number
  successRate: number   // 0–1
}

export interface ActivePipeline {
  run: WorkflowRun
  repository: string
}

// ── App config ────────────────────────────────────────────────────────────────

export interface AppConfig {
  watchWorkflows: string[]
}
