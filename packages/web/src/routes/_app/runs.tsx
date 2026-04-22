import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueries } from "@tanstack/react-query"
import { z } from "zod"
import { getRepos, getRuns } from "../../api/index.js"
import { StatusBadge } from "../../components/ui/Badge.js"
import { Card, CardHeader } from "../../components/ui/Card.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { EventBadge } from "../../components/ui/EventBadge.js"
import { formatRelativeTime, formatDuration, formatDateTime } from "../../lib/utils.js"
import type { WorkflowRun } from "../../types/index.js"

const searchSchema = z.object({
  filter: z.string().optional(),
})

export const Route = createFileRoute("/_app/runs")({
  validateSearch: searchSchema,
  component: AllRuns,
})

// ── Pure helpers ───────────────────────────────────────────────────────────────

export interface RunWithRepo {
  run: WorkflowRun
  owner: string
  repo: string
}

/** Flattens per-repo run arrays and sorts newest first. */
export function mergeAndSortRuns(perRepo: RunWithRepo[][]): RunWithRepo[] {
  return perRepo
    .flat()
    .sort((a, b) => new Date(b.run.createdAt).getTime() - new Date(a.run.createdAt).getTime())
}

/** Case-insensitive filter across repo, title, branch, actor and workflow name. */
export function filterRuns(runs: RunWithRepo[], query: string): RunWithRepo[] {
  const q = query.toLowerCase()
  return runs.filter(({ run, owner, repo }) =>
    `${owner}/${repo}`.includes(q) ||
    run.displayTitle.toLowerCase().includes(q) ||
    run.headBranch.toLowerCase().includes(q) ||
    (run.actor?.login.toLowerCase().includes(q) ?? false) ||
    run.workflowName.toLowerCase().includes(q)
  )
}

// ── Sort ───────────────────────────────────────────────────────────────────────

export type SortKey =
  | "repository" | "displayTitle" | "workflowName" | "headBranch"
  | "event" | "actor" | "status" | "duration" | "started"

/** Natural first-click direction for each column. */
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  repository:   "asc",
  displayTitle: "asc",
  workflowName: "asc",
  headBranch:   "asc",
  event:        "asc",
  actor:        "asc",
  status:       "asc",   // asc = problems first (running → failure → cancelled → success)
  duration:     "desc",
  started:      "desc",
}

/** asc: running → failure → cancelled → success */
function statusOrder(status: string, conclusion: string | null): number {
  if (status !== "completed") return 0
  switch (conclusion) {
    case "failure":
    case "timed_out":  return 1
    case "cancelled":
    case "skipped":    return 2
    case "success":    return 3
    default:           return 4
  }
}

function runDurationMs(run: WorkflowRun): number {
  if (!run.runStartedAt) return 0
  return new Date(run.updatedAt).getTime() - new Date(run.runStartedAt).getTime()
}

export function sortRuns(
  runs: RunWithRepo[],
  key: SortKey,
  dir: "asc" | "desc",
): RunWithRepo[] {
  const factor = dir === "asc" ? 1 : -1
  return [...runs].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case "repository":   cmp = `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`); break
      case "displayTitle": cmp = a.run.displayTitle.localeCompare(b.run.displayTitle); break
      case "workflowName": cmp = a.run.workflowName.localeCompare(b.run.workflowName); break
      case "headBranch":   cmp = a.run.headBranch.localeCompare(b.run.headBranch); break
      case "event":        cmp = a.run.event.localeCompare(b.run.event); break
      case "actor":        cmp = (a.run.actor?.login ?? "").localeCompare(b.run.actor?.login ?? ""); break
      case "status":       cmp = statusOrder(a.run.status, a.run.conclusion) - statusOrder(b.run.status, b.run.conclusion); break
      case "duration":     cmp = runDurationMs(a.run) - runDurationMs(b.run); break
      case "started":      cmp = new Date(a.run.runStartedAt ?? a.run.createdAt).getTime() - new Date(b.run.runStartedAt ?? b.run.createdAt).getTime(); break
    }
    return factor * cmp
  })
}

// ── Route component ───────────────────────────────────────────────────────────

function AllRuns() {
  const { filter = "" } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: ["repos", "user"],
    queryFn: () => getRepos(),
    staleTime: 15 * 60 * 1000,
  })

  const repoList = repos ?? []

  const runResults = useQueries({
    queries: repoList.map((r) => {
      const [owner, name] = r.fullName.split("/")
      return {
        queryKey: ["runs", r.fullName, "all-runs"] as const,
        queryFn: () => getRuns(owner!, name!, { per_page: 25 }),
        staleTime: 30 * 1000,
        refetchInterval: 30_000,
        enabled: !!owner && !!name,
      }
    }),
  })

  if (reposLoading) return <PageSpinner />

  const perRepo: RunWithRepo[][] = repoList.map((repo, i) => {
    const [owner, name] = repo.fullName.split("/")
    return (runResults[i]?.data?.runs ?? []).map((run) => ({
      run,
      owner: owner!,
      repo: name!,
    }))
  })

  const sortedRuns = mergeAndSortRuns(perRepo)
  const visibleRuns = filter ? filterRuns(sortedRuns, filter) : sortedRuns
  const isFiltered = filter.length > 0

  const title = isFiltered
    ? `All Runs (${visibleRuns.length} of ${sortedRuns.length})`
    : `All Runs (${sortedRuns.length})`

  function setFilter(value: string) {
    void navigate({ search: value ? { filter: value } : {} })
  }

  return (
    <div>
      <Card>
        <CardHeader title={title} />
        <div style={{ marginBottom: "0.75rem" }}>
          <input
            type="search"
            placeholder="Search here..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "0.3125rem 0.625rem",
              fontSize: 13,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
        </div>
        {visibleRuns.length === 0 ? (
          <p className="empty-state">
            {isFiltered ? `No runs match "${filter}".` : "No runs found."}
          </p>
        ) : (
          <AllRunsTable runs={visibleRuns} />
        )}
      </Card>
    </div>
  )
}

// ── Presentational table ───────────────────────────────────────────────────────

export function AllRunsTable({ runs }: { runs: RunWithRepo[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("started")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(DEFAULT_DIR[key])
    }
  }

  const sorted = sortRuns(runs, sortKey, sortDir)

  const th = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      style={{ cursor: "pointer", userSelect: "none" }}
    >
      {label}
    </th>
  )

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            {th("repository", "Repository")}
            {th("displayTitle", "Run")}
            {th("workflowName", "Workflow")}
            {th("headBranch", "Branch / Commit")}
            {th("event", "Event")}
            {th("actor", "Actor")}
            {th("status", "Status")}
            {th("duration", "Duration")}
            {th("started", "Started")}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ run, owner, repo }) => (
            <tr key={run.id}>
              <td className="text-small" style={{ whiteSpace: "nowrap" }}>
                <span className="health-repo-label-owner">{owner}/</span>
                <Link
                  to="/repositories/$owner/$repo"
                  params={{ owner, repo }}
                  style={{ fontWeight: 500 }}
                >
                  {repo}
                </Link>
              </td>
              <td>
                <Link
                  to="/runs/$owner/$repo/$runId"
                  params={{ owner, repo, runId: String(run.id) }}
                  title={run.displayTitle}
                  style={{ fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {run.displayTitle}
                </Link>
                {run.runAttempt > 1 && (
                  <span className="badge badge-neutral" style={{ marginLeft: "0.375rem", fontSize: 10 }}>
                    ×{run.runAttempt}
                  </span>
                )}
              </td>
              <td className="text-small text-muted">{run.workflowName}</td>
              <td>
                <div>
                  <a
                    href={`https://github.com/${owner}/${repo}/tree/${run.headBranch}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono text-small"
                    title={run.headBranch}
                    style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "25ch" }}
                  >
                    {run.headBranch}
                  </a>
                </div>
                <a
                  href={`https://github.com/${owner}/${repo}/commit/${run.headSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-small text-muted"
                  title={run.headSha}
                >
                  {run.headSha.slice(0, 7)}
                </a>
              </td>
              <td>
                <EventBadge event={run.event} />
              </td>
              <td className="text-small text-muted">
                {run.actor?.login ?? "—"}
              </td>
              <td>
                <StatusBadge status={run.status} conclusion={run.conclusion} dotOnly />
              </td>
              <td className="text-muted text-small">
                {formatDuration(run.runStartedAt, run.updatedAt)}
              </td>
              <td className="text-muted text-small" title={formatDateTime(run.runStartedAt ?? run.createdAt)}>
                {formatRelativeTime(run.runStartedAt ?? run.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
