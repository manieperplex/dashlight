import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { getRuns } from "../../api/index.js"
import type { WorkflowRun } from "../../types/index.js"
import { StatusBadge } from "../../components/ui/Badge.js"
import { Button } from "../../components/ui/Button.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { EventBadge } from "../../components/ui/EventBadge.js"
import { formatRelativeTime, formatDuration, formatDateTime } from "../../lib/utils.js"

const searchSchema = z.object({
  q: z.string().optional(),
  page: z.number().optional().default(1),
})

export const Route = createFileRoute("/_app/repositories/$owner/$repo/runs")({
  validateSearch: searchSchema,
  component: RunsList,
})

// ── Sort ───────────────────────────────────────────────────────────────────────

export type SortKey =
  | "runNumber" | "displayTitle" | "workflowName" | "headBranch"
  | "event" | "actor" | "status" | "duration" | "started"

/** Natural first-click direction for each column. */
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  runNumber:    "desc",
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
  runs: WorkflowRun[],
  key: SortKey,
  dir: "asc" | "desc",
): WorkflowRun[] {
  const factor = dir === "asc" ? 1 : -1
  return [...runs].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case "runNumber":    cmp = a.runNumber - b.runNumber; break
      case "displayTitle": cmp = a.displayTitle.localeCompare(b.displayTitle); break
      case "workflowName": cmp = a.workflowName.localeCompare(b.workflowName); break
      case "headBranch":   cmp = a.headBranch.localeCompare(b.headBranch); break
      case "event":        cmp = a.event.localeCompare(b.event); break
      case "actor":        cmp = (a.actor?.login ?? "").localeCompare(b.actor?.login ?? ""); break
      case "status":       cmp = statusOrder(a.status, a.conclusion) - statusOrder(b.status, b.conclusion); break
      case "duration":     cmp = runDurationMs(a) - runDurationMs(b); break
      case "started":      cmp = new Date(a.runStartedAt ?? a.createdAt).getTime() - new Date(b.runStartedAt ?? b.createdAt).getTime(); break
    }
    return factor * cmp
  })
}

// ── Filter ─────────────────────────────────────────────────────────────────────

/**
 * Client-side multi-field filter. Checks all searchable text fields on a run
 * against the query string (case-insensitive substring match).
 *
 * Fields searched: workflow name, branch, commit SHA, actor login,
 * run status, and conclusion.
 */
export function filterRuns(runs: WorkflowRun[], q: string): WorkflowRun[] {
  if (!q) return runs
  const lower = q.toLowerCase()
  return runs.filter(
    (r) =>
      r.workflowName.toLowerCase().includes(lower) ||
      r.headBranch.toLowerCase().includes(lower) ||
      r.headSha.toLowerCase().includes(lower) ||
      (r.actor?.login.toLowerCase().includes(lower) ?? false) ||
      r.status.toLowerCase().includes(lower) ||
      (r.conclusion?.toLowerCase().includes(lower) ?? false),
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RunsList() {
  const { owner, repo } = Route.useParams()
  const { q, page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

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

  // When a filter is active, fetch a larger batch so the client-side filter
  // has enough history. Pagination is suppressed in this mode.
  const perPage = q ? 100 : 30

  const { data, isLoading } = useQuery({
    queryKey: ["runs", `${owner}/${repo}`, { page: q ? 1 : page, perPage }],
    queryFn: () => getRuns(owner, repo, { page: q ? 1 : page, per_page: perPage }),
    refetchInterval: 30_000,
  })

  const allRuns = data?.runs ?? []
  const runs = sortRuns(filterRuns(allRuns, q ?? ""), sortKey, sortDir)
  const totalPages = q ? 0 : Math.ceil((data?.total ?? 0) / 30)

  function setQ(value: string) {
    void navigate({ search: (prev) => ({ ...prev, q: value || undefined, page: 1 }) })
  }

  if (isLoading) return <PageSpinner />

  const th = (key: SortKey, label: string, extra?: React.CSSProperties) => (
    <th
      onClick={() => toggleSort(key)}
      style={{ cursor: "pointer", userSelect: "none", ...extra }}
    >
      {label}
    </th>
  )

  return (
    <div>
      <div className="page-header">
        <div className="flex-center gap-2" style={{ marginBottom: "0.25rem" }}>
          <Link to="/repositories" className="text-muted text-small">Repositories</Link>
          <span className="text-muted text-small">/</span>
          <span className="text-muted text-small">{owner}</span>
          <span className="text-muted text-small">/</span>
          <Link
            to="/repositories/$owner/$repo"
            params={{ owner, repo }}
            className="text-muted text-small"
          >
            {repo}
          </Link>
          <span className="text-muted text-small">/</span>
          <span>Runs</span>
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Search here..."
          value={q ?? ""}
          onChange={(e) => setQ(e.target.value)}
          style={{
            width: "100%", maxWidth: 480,
            padding: "0.375rem 0.625rem", borderRadius: "var(--radius)",
            border: "1px solid var(--color-border)", background: "var(--color-bg)",
            color: "var(--color-text)", fontSize: 13,
          }}
        />
      </div>

      <div className="card">
        {runs.length === 0 ? (
          <p className="empty-state">No runs found.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {th("runNumber", "#")}
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
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="text-muted text-small mono">{run.runNumber}</td>
                    <td>
                      <Link
                        to="/runs/$owner/$repo/$runId"
                        params={{ owner, repo, runId: String(run.id) }}
                        title={run.displayTitle}
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
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
                      {formatRelativeTime(run.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex-center gap-2" style={{ padding: "0.75rem", borderTop: "1px solid var(--color-border)" }}>
            <Button
              size="sm"
              disabled={(page ?? 1) <= 1}
              onClick={() => void navigate({ search: (prev) => ({ ...prev, page: (page ?? 1) - 1 }) })}
            >
              ← Prev
            </Button>
            <span className="text-muted text-small">
              Page {page ?? 1} of {totalPages}
            </span>
            <Button
              size="sm"
              disabled={(page ?? 1) >= totalPages}
              onClick={() => void navigate({ search: (prev) => ({ ...prev, page: (page ?? 1) + 1 }) })}
            >
              Next →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
