import React, { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useQueries } from "@tanstack/react-query"
import { getRepos, getRuns, getAppConfig } from "../../api/index.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { Card, CardHeader } from "../../components/ui/Card.js"
import { RepoActivityChart, BuildTrendChart } from "../../components/charts/RunCharts.js"
import type { RepoRunEntry } from "../../components/charts/RunCharts.js"
import { SuccessSquares } from "../../components/ui/SuccessSquares.js"
import { formatRelativeTime, computeRunSummary, formatDuration, runStatusVariant, VARIANT_COLOR } from "../../lib/utils.js"
import { WorkflowHealthSection } from "../../components/WorkflowHealthSection.js"
import type { Repository, WorkflowRun } from "../../types/index.js"

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
})

function Dashboard() {
  const { data: repos, isLoading } = useQuery({
    queryKey: ["repos", "user"],
    queryFn: () => getRepos(),
    refetchInterval: 60_000,
  })

  const { data: appConfig } = useQuery({
    queryKey: ["config"],
    queryFn: () => getAppConfig(),
    staleTime: Infinity,
  })

  const repoList = (repos ?? []).slice(0, 10)

  // useQueries handles a dynamic-length array without violating Rules of Hooks
  const runResults = useQueries({
    queries: repoList.map((r) => {
      const [owner, name] = r.fullName.split("/")
      return {
        queryKey: ["runs", r.fullName, "recent"] as const,
        queryFn: () => getRuns(owner!, name!, { per_page: 100 }),
        refetchInterval: 60_000,
        enabled: !!owner && !!name,
      }
    }),
  })

  if (isLoading) return <PageSpinner />

  const repoRuns: RepoRunEntry[] = repoList.map((repo, i) => ({
    name: repo.name,
    fullName: repo.fullName,
    runs: runResults[i]?.data?.runs ?? [],
  }))

  const watchWorkflows = appConfig?.watchWorkflows ?? []

  return (
    <div>
      <div className="stack">
        <WorkflowHealthSection watchWorkflows={watchWorkflows} repoRuns={repoRuns} />
        <ActivityCard repoRuns={repoRuns} repos={repoList} />
        <HealthTable repoRuns={repoRuns} repos={repoList} />
        <BuildTrendsCard repoRuns={repoRuns} repos={repoList} />
      </div>
    </div>
  )
}

// ── Latest run cards ──────────────────────────────────────────────────────────

export function pickDisplayRun(runs: WorkflowRun[]): WorkflowRun | undefined {
  return (
    runs.find((r) => r.status === "in_progress" || r.status === "queued") ?? runs[0]
  )
}

function RunDot({ status, conclusion }: { status: WorkflowRun["status"]; conclusion: WorkflowRun["conclusion"] }) {
  const isActive = status === "in_progress" || status === "queued"
  let colorClass = "run-dot-neutral"
  if (conclusion === "success") colorClass = "run-dot-success"
  else if (conclusion === "failure" || conclusion === "timed_out") colorClass = "run-dot-failure"
  else if (conclusion === "cancelled") colorClass = "run-dot-cancelled"
  else if (isActive) colorClass = "run-dot-running"
  return <span className={`run-dot ${colorClass}${isActive ? " run-dot-pulse" : ""}`} />
}

export function RepoRunCards({ fullName, runs }: { fullName: string; runs: WorkflowRun[] }) {
  const entries: WorkflowRun[] = []
  const byWorkflow = new Map<number, WorkflowRun[]>()
  for (const run of runs) {
    const bucket = byWorkflow.get(run.workflowId) ?? []
    bucket.push(run)
    byWorkflow.set(run.workflowId, bucket)
  }
  for (const workflowRuns of byWorkflow.values()) {
    const run = pickDisplayRun(workflowRuns)
    if (run) entries.push(run)
  }

  if (entries.length === 0) return null

  const [owner, name] = fullName.split("/")
  return (
    <div className="latest-runs-grid">
      {entries.map((run) => {
        const isActive = run.status === "in_progress" || run.status === "queued"
        const commitUrl = `https://github.com/${fullName}/commit/${run.headSha}`
        const duration = formatDuration(run.runStartedAt, isActive ? null : run.updatedAt)
        const borderColor = VARIANT_COLOR[runStatusVariant(run.status, run.conclusion)]
        return (
          <div
            key={`${fullName}/${run.workflowId}`}
            className="latest-run-card"
            data-active={isActive || undefined}
            style={{ borderLeft: `3px solid ${borderColor}` }}
          >
            <div className="flex-center gap-2" style={{ justifyContent: "space-between", minWidth: 0 }}>
              <Link
                to="/runs/$owner/$repo/$runId"
                params={{ owner: owner!, repo: name!, runId: String(run.id) }}
                className="latest-run-workflow latest-run-card-link truncate"
              >
                {run.workflowName ?? run.name}
              </Link>
              <RunDot status={run.status} conclusion={run.conclusion} />
            </div>
            <div className="flex-center gap-2 latest-run-meta" style={{ flexWrap: "wrap" }}>
              <a
                href={`https://github.com/${fullName}/tree/${run.headBranch}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono latest-run-sha flex-center gap-1 latest-run-meta-link"
              >
                <BranchIcon />
                <span className="truncate" style={{ maxWidth: "10ch" }}>{run.headBranch}</span>
              </a>
              <span style={{ opacity: 0.4 }}>·</span>
              <a
                href={commitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mono latest-run-sha flex-center gap-1 latest-run-meta-link"
              >
                <CommitIcon />
                {run.headSha.slice(0, 7)}
              </a>
            </div>
            <div className="flex-center gap-1 latest-run-time">
              <ClockIcon />
              {duration}
              <span style={{ opacity: 0.4 }}>·</span>
              {formatRelativeTime(run.runStartedAt ?? run.createdAt)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/>
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>
    </svg>
  )
}

function BranchIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 2.25a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5zM4.25 13.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zM5 15.75a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5zM4.25 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zM5 4.75a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5z"/>
      <path d="M5 6.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0zm5.06-1.28a.75.75 0 0 1-.78 1.28A3.5 3.5 0 0 0 5.75 9.5v.75a.75.75 0 0 1-1.5 0V9.5a5 5 0 0 1 5.785-4.53z"/>
    </svg>
  )
}

function CommitIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0z"/>
    </svg>
  )
}

function WorkflowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M0 1.75C0 .784.784 0 1.75 0h3.5C6.216 0 7 .784 7 1.75v3.5A1.75 1.75 0 0 1 5.25 7H4v1h5a1 1 0 0 1 1 1v1h1.25A1.75 1.75 0 0 1 13 11.75v3.5A1.75 1.75 0 0 1 11.25 17h-3.5A1.75 1.75 0 0 1 6 15.25v-3.5C6 10.784 6.784 10 7.75 10H9V9H4a1 1 0 0 1-1-1V7H1.75A1.75 1.75 0 0 1 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Zm6 10a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Z"/>
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0m4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z"/>
    </svg>
  )
}

function SuccessIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm10.28-1.72-4.5 4.5a.75.75 0 0 1-1.06 0l-2-2a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l1.47 1.47 3.97-3.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/>
    </svg>
  )
}

function FailIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M2.343 13.657A8 8 0 1 1 13.657 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.99a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.99a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.99-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"/>
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.75-1h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z"/>
    </svg>
  )
}

// ── Build Activity card ───────────────────────────────────────────────────────

export function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const mins = Math.floor(totalSeconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
}

export function ActivityCard({ repoRuns, repos }: { repoRuns: RepoRunEntry[]; repos: Repository[] }) {
  const activeCount = repoRuns.filter(({ runs }) => runs.length > 0).length
  const subtitle = activeCount > 0
    ? `${activeCount} of ${repos.length} ${repos.length === 1 ? "repository" : "repositories"} active`
    : undefined

  const allRuns = repoRuns.flatMap(({ runs }) => runs)
  const workflowIds = new Set(allRuns.map((r) => r.workflowId))
  const totalRuns = allRuns.length
  const totalSucceeded = allRuns.filter((r) => r.conclusion === "success").length
  const totalFailed = allRuns.filter((r) => r.conclusion === "failure" || r.conclusion === "timed_out").length
  const totalCancelled = allRuns.filter((r) => r.conclusion === "cancelled").length
  const totalDurationSec = allRuns.reduce((acc, r) => {
    if (!r.runStartedAt || !r.updatedAt) return acc
    return acc + Math.floor((new Date(r.updatedAt).getTime() - new Date(r.runStartedAt).getTime()) / 1000)
  }, 0)

  return (
    <Card>
      <div style={{ marginBottom: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex-center" style={{ justifyContent: "space-between" }}>
          <span className="card-title">Build Activity</span>
          {subtitle && <span className="text-muted text-small">{subtitle}</span>}
        </div>
        <p className="text-muted text-small" style={{ marginTop: "0.2rem" }}>
          Run frequency across repositories — last 30 days
        </p>
      </div>
      <RepoActivityChart repoRuns={repoRuns} />
      <div className="activity-stats">
        <span className="activity-stat">
          <WorkflowIcon />
          <span className="activity-stat-value">{workflowIds.size}</span>
          <span className="activity-stat-label">workflows</span>
        </span>
        <span className="activity-stat">
          <PlayIcon />
          <span className="activity-stat-value">{totalRuns}</span>
          <span className="activity-stat-label">runs</span>
        </span>
        <span className="activity-stat">
          <SuccessIcon />
          <span className="activity-stat-value">{totalSucceeded}</span>
          <span className="activity-stat-label">succeeded</span>
        </span>
        <span className="activity-stat">
          <FailIcon />
          <span className="activity-stat-value">{totalFailed}</span>
          <span className="activity-stat-label">failed</span>
        </span>
        <span className="activity-stat">
          <CancelIcon />
          <span className="activity-stat-value">{totalCancelled}</span>
          <span className="activity-stat-label">canceled</span>
        </span>
        <span className="activity-stat">
          <ClockIcon />
          <span className="activity-stat-value">{formatSeconds(totalDurationSec)}</span>
          <span className="activity-stat-label">total duration</span>
        </span>
      </div>
    </Card>
  )
}

// ── Repository Health table ───────────────────────────────────────────────────


export function groupByWorkflow(runs: WorkflowRun[]) {
  const map = new Map<number, { name: string; runs: WorkflowRun[] }>()
  for (const run of runs) {
    const entry = map.get(run.workflowId) ?? { name: run.workflowName ?? run.name, runs: [] }
    entry.runs.push(run)
    map.set(run.workflowId, entry)
  }
  // Sort by most recent run
  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.runs[0]?.createdAt ?? 0).getTime()
    const bTime = new Date(b.runs[0]?.createdAt ?? 0).getTime()
    return bTime - aTime
  })
}

const WORKFLOW_LIMIT = 10

export function HealthTable({ repoRuns, repos }: { repoRuns: RepoRunEntry[]; repos: Repository[] }) {
  const rows = repos
    .map((repo, i) => {
      const runs = repoRuns[i]?.runs ?? []
      const summary = computeRunSummary(runs)
      const workflows = groupByWorkflow(runs)
      return { repo, summary, runs, workflows }
    })
    .sort((a, b) => {
      const aTime = new Date(a.runs[0]?.createdAt ?? 0).getTime()
      const bTime = new Date(b.runs[0]?.createdAt ?? 0).getTime()
      return bTime - aTime
    })

  // Default: expand top 3 repos by most recent run
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(
    rows
      .filter((r) => r.runs.length > 0)
      .sort((a, b) =>
        new Date(b.runs[0]?.createdAt ?? 0).getTime() - new Date(a.runs[0]?.createdAt ?? 0).getTime()
      )
      .slice(0, 3)
      .map((r) => r.repo.id)
  ))
  const [showAllWf, setShowAllWf] = useState<Set<number>>(new Set())

  function toggleRepo(id: number) {
    setExpanded((prev) => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) }; return s })
  }
  function toggleShowAllWf(id: number) {
    setShowAllWf((prev) => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) }; return s })
  }

  return (
    <Card>
      <CardHeader title="Repository Health" />
      {rows.length === 0 ? (
        <p className="empty-state">No repositories found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <tbody>
              {rows.map(({ repo, summary, runs, workflows }) => {
                const [owner, name] = repo.fullName.split("/")
                const lastRun = runs[0]
                const isOpen = expanded.has(repo.id)
                const showAll = showAllWf.has(repo.id)
                const visibleWf = showAll ? workflows : workflows.slice(0, WORKFLOW_LIMIT)
                const hiddenCount = workflows.length - WORKFLOW_LIMIT

                return (
                  <React.Fragment key={repo.id}>
                    {/* ── Repo name label ── */}
                    <tr className="health-repo-label-row">
                      <td colSpan={4}>
                        <Link
                          to="/repositories/$owner/$repo"
                          params={{ owner: owner!, repo: name! }}
                          className="health-repo-label"
                        >
                          <span className="health-repo-label-owner">{owner}/</span>{name}
                        </Link>
                      </td>
                    </tr>
                    {/* ── Per-repo run cards ── */}
                    {runs.length > 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: "0 0 0", border: "none" }}>
                          <RepoRunCards fullName={repo.fullName} runs={runs} />
                        </td>
                      </tr>
                    )}
                    {/* ── Column headers ── */}
                    <tr className="health-col-header-row">
                      <th>Repository / Workflow</th>
                      <th>Last run</th>
                      <th>Success rate (last 100)</th>
                      <th>In progress</th>
                    </tr>
                    {/* ── Repo row ── */}
                    <tr className="health-repo-row" onClick={() => toggleRepo(repo.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <span className="flex-center gap-2">
                          <Chevron open={isOpen} />
                          <Link
                            to="/repositories/$owner/$repo"
                            params={{ owner: owner!, repo: name! }}
                            style={{ fontWeight: 600 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {repo.fullName}
                          </Link>
                        </span>
                      </td>
                      <td className="text-muted text-small health-last-run">
                        {lastRun ? (
                          <span className="flex-center gap-2">
                            <RunDot status={lastRun.status} conclusion={lastRun.conclusion} />
                            {formatRelativeTime(lastRun.createdAt)}
                          </span>
                        ) : "—"}
                      </td>
                      <td><SuccessSquares runs={runs} /></td>
                      <td className="text-muted text-small">
                        {summary.inProgress > 0 ? summary.inProgress : "—"}
                      </td>
                    </tr>

                    {/* ── Per-workflow sub-rows ── */}
                    {isOpen && visibleWf.map((wf) => {
                      const wfSummary = computeRunSummary(wf.runs)
                      const wfLast = wf.runs[0]
                      return (
                        <tr key={`${repo.id}-${wf.name}`} className="health-workflow-row">
                          <td>
                            <span className="health-workflow-name-cell">
                              <span className="health-workflow-indent">↳</span>
                              {wfLast ? (
                                <Link
                                  to="/runs/$owner/$repo/$runId"
                                  params={{ owner: owner!, repo: name!, runId: String(wfLast.id) }}
                                  className="text-muted truncate"
                                >
                                  {wf.name}
                                </Link>
                              ) : (
                                <span className="text-muted truncate">{wf.name}</span>
                              )}
                            </span>
                          </td>
                          <td className="text-muted text-small health-last-run">
                            {wfLast ? (
                              <span className="flex-center gap-2">
                                <RunDot status={wfLast.status} conclusion={wfLast.conclusion} />
                                {formatRelativeTime(wfLast.createdAt)}
                              </span>
                            ) : "—"}
                          </td>
                          <td><SuccessSquares runs={wf.runs} muted /></td>
                          <td className="text-muted text-small">
                            {wfSummary.inProgress > 0 ? wfSummary.inProgress : "—"}
                          </td>
                        </tr>
                      )
                    })}

                    {/* ── "Show N more" row ── */}
                    {isOpen && !showAll && hiddenCount > 0 && (
                      <tr className="health-workflow-row">
                        <td colSpan={4}>
                          <button
                            className="health-show-more"
                            onClick={() => toggleShowAllWf(repo.id)}
                          >
                            ↓ {hiddenCount} more workflow{hiddenCount !== 1 ? "s" : ""}
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 16 16" fill="currentColor"
      style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)", color: "var(--color-text-tertiary)" }}
    >
      <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
  )
}

// ── Per-repo Build Trend mini-charts ──────────────────────────────────────────

export function BuildTrendsCard({ repoRuns, repos }: { repoRuns: RepoRunEntry[]; repos: Repository[] }) {
  const active = repoRuns.filter(({ runs }) => runs.length > 0)
  if (active.length === 0) return null

  return (
    <Card>
      <CardHeader title="Build Trends" />
      <div className="trend-grid">
        {active.map(({ fullName, runs }) => {
          const [owner, name] = fullName.split("/")
          const repo = repos.find((r) => r.fullName === fullName)
          if (!repo) return null
          return (
            <div key={fullName} className="trend-item">
              <div className="trend-item-label">
                <Link to="/repositories/$owner/$repo" params={{ owner: owner!, repo: name! }}>
                  {fullName}
                </Link>
              </div>
              <BuildTrendChart runs={runs} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
