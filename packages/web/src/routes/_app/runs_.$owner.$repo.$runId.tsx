import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { lazy, Suspense, useState, Fragment } from "react"
import {
  getRun, getRunJobs, getRuns, getRunArtifacts, getJobLogs,
  rerunWorkflow, rerunFailedJobs, cancelRun,
} from "../../api/index.js"
import { StatusBadge } from "../../components/ui/Badge.js"
import { EventBadge } from "../../components/ui/EventBadge.js"
import { Button } from "../../components/ui/Button.js"
import { Card, CardHeader } from "../../components/ui/Card.js"
import { PageSpinner, Spinner } from "../../components/ui/Spinner.js"
import { formatRelativeTime, formatDuration, formatDateTime } from "../../lib/utils.js"
import type { WorkflowRun, WorkflowJob, JobStep, RunArtifact } from "../../types/index.js"

const WorkflowDAG = lazy(() =>
  import("../../components/dag/WorkflowDAG.js").then((m) => ({ default: m.WorkflowDAG }))
)

export const Route = createFileRoute("/_app/runs_/$owner/$repo/$runId")({
  component: RunDetail,
})

// ── Trigger description ───────────────────────────────────────────────────────

export function triggerDescription(run: WorkflowRun): string {
  const actor = run.actor?.login
  switch (run.event) {
    case "push":
      return actor ? `Pushed by ${actor}` : "Pushed"
    case "workflow_dispatch":
      return actor ? `Manually triggered by ${actor}` : "Manually triggered"
    case "schedule":
      return "Scheduled run"
    case "pull_request":
    case "pull_request_target":
      return actor ? `Pull request by ${actor}` : "Pull request"
    default:
      return run.event
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

function RunDetail() {
  const { owner, repo, runId } = Route.useParams()
  const qc = useQueryClient()

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ["run", owner, repo, runId],
    queryFn: () => getRun(owner, repo, parseInt(runId, 10)),
    refetchInterval: (query) => {
      const r = query.state.data
      return r?.status === "in_progress" || r?.status === "queued" ? 10_000 : false
    },
  })

  const { data: jobs } = useQuery({
    queryKey: ["run-jobs", owner, repo, runId],
    queryFn: () => getRunJobs(owner, repo, parseInt(runId, 10)),
    enabled: !!run,
    refetchInterval: run?.status === "in_progress" ? 10_000 : false,
  })

  const { data: artifacts } = useQuery({
    queryKey: ["run-artifacts", owner, repo, runId],
    queryFn: () => getRunArtifacts(owner, repo, parseInt(runId, 10)),
    enabled: run?.status === "completed",
    staleTime: 5 * 60 * 1000,
  })

  const rerunMutation = useMutation({
    mutationFn: () => rerunWorkflow(owner, repo, parseInt(runId, 10)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["run", owner, repo, runId] }),
  })
  const rerunFailedMutation = useMutation({
    mutationFn: () => rerunFailedJobs(owner, repo, parseInt(runId, 10)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["run", owner, repo, runId] }),
  })
  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(owner, repo, parseInt(runId, 10)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["run", owner, repo, runId] }),
  })

  if (runLoading) return <PageSpinner />
  if (!run) return <p className="empty-state">Run not found.</p>

  const isActive = run.status === "in_progress" || run.status === "queued"
  const hasFailed = run.conclusion === "failure" || run.conclusion === "timed_out"

  return (
    <div>
      {/* ── Breadcrumb ── */}
      <div className="page-header">
        <div className="flex-center gap-2" style={{ marginBottom: "0.5rem" }}>
          <Link to="/runs" className="text-muted text-small">Runs</Link>
          <span className="text-muted text-small">/</span>
          <span className="text-muted text-small">{owner}/{repo}</span>
          <span className="text-muted text-small">/</span>
          <span className="mono text-small">#{run.runNumber}</span>
        </div>

        {/* ── Title + workflow + event + actions ── */}
        <div className="flex-center gap-3" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: "0.25rem" }}>
              {run.displayTitle}
            </h1>
            <div className="flex-center gap-2 text-small text-muted">
              {run.workflowPath ? (
                <a
                  href={`https://github.com/${owner}/${repo}/actions/workflows/${run.workflowPath.split("/").pop()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {run.workflowName}
                </a>
              ) : (
                <span>{run.workflowName}</span>
              )}
              <span>·</span>
              <span>on:</span>
              <EventBadge event={run.event} />
            </div>
          </div>
          <div className="flex-center gap-1" style={{ marginTop: "0.25rem" }}>
            {isActive && (
              <Button size="sm" variant="danger" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                Cancel
              </Button>
            )}
            {!isActive && (
              <>
                <Button size="sm" loading={rerunMutation.isPending} onClick={() => rerunMutation.mutate()}>
                  Re-run all
                </Button>
                {hasFailed && (
                  <Button size="sm" loading={rerunFailedMutation.isPending} onClick={() => rerunFailedMutation.mutate()}>
                    Re-run failed
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <RunSummaryBar run={run} owner={owner} repo={repo} artifacts={artifacts} />

      <div className="stack" style={{ marginTop: "1.25rem" }}>
        {/* ── Recent runs on same branch ── */}
        <BranchHistoryCard owner={owner} repo={repo} currentRunId={run.id} branch={run.headBranch} event={run.event} />

        {/* ── Jobs ── */}
        <JobsCard jobs={jobs} owner={owner} repo={repo} runCompleted={run.status === "completed"} />

        {/* ── Job DAG ── */}
        {jobs && jobs.length > 0 && (
          <Card>
            <CardHeader title="Job DAG" />
            <Suspense fallback={<div className="flex-center gap-2" style={{ padding: "2rem" }}><Spinner /> Loading DAG…</div>}>
              <WorkflowDAG jobs={jobs} />
            </Suspense>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

export function RunSummaryBar({
  run, owner, repo, artifacts,
}: {
  run: WorkflowRun
  owner: string
  repo: string
  artifacts?: RunArtifact[]
}) {
  const commitUrl = `https://github.com/${owner}/${repo}/commit/${run.headSha}`
  const branchUrl = `https://github.com/${owner}/${repo}/tree/${run.headBranch}`

  const artifactChip = () => {
    if (artifacts && artifacts.length > 0) {
      return (
        <a href={`${run.htmlUrl}#artifacts`} target="_blank" rel="noopener noreferrer" className="run-summary-chip">
          <span className="text-muted">Artifacts</span>
          <span>{artifacts.length}</span>
        </a>
      )
    }
    return <span className="run-summary-chip"><span className="text-muted">Artifacts</span><span>—</span></span>
  }

  return (
    <div className="run-summary-bar">
      <div className="run-summary-trigger">
        <span>{triggerDescription(run)}</span>
        <span className="text-muted"> · {formatRelativeTime(run.runStartedAt ?? run.createdAt)}</span>
      </div>
      <div className="run-summary-meta">
        {run.actor && (
          <span className="run-summary-chip">
            <img src={run.actor.avatarUrl} alt="" width={14} height={14} style={{ borderRadius: "50%", verticalAlign: "middle" }} />
            <span>@{run.actor.login}</span>
          </span>
        )}
        <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="run-summary-chip mono">
          {run.headSha.slice(0, 7)}
        </a>
        <a href={branchUrl} target="_blank" rel="noopener noreferrer" className="run-summary-chip mono">
          {run.headBranch}
        </a>
        <span className="run-summary-chip">
          <StatusBadge status={run.status} conclusion={run.conclusion} />
        </span>
        <span className="run-summary-chip">
          <span className="text-muted">Duration</span>
          <span>{formatDuration(run.runStartedAt, run.status === "completed" ? run.updatedAt : null)}</span>
        </span>
        {artifactChip()}
        {run.runAttempt > 1 && (
          <span className="run-summary-chip">
            <span className="badge badge-neutral text-small">Attempt #{run.runAttempt}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ── Jobs card ─────────────────────────────────────────────────────────────────

export function JobsCard({
  jobs, owner = "", repo = "", runCompleted = false,
}: {
  jobs: WorkflowJob[] | undefined
  owner?: string
  repo?: string
  runCompleted?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  return (
    <Card>
      <CardHeader title={`Jobs (${jobs?.length ?? "…"})`} />
      {!jobs ? (
        <PageSpinner />
      ) : jobs.length === 0 ? (
        <p className="empty-state">No jobs found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Steps</th>
                <th>Duration</th>
                <th>Runner</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <Fragment key={job.id}>
                  <tr className="job-row" onClick={() => toggle(job.id)}>
                    <td style={{ fontWeight: 500 }}>
                      <span className={`job-chevron${expanded.has(job.id) ? " job-chevron-open" : ""}`}>▸</span>
                      {job.name}
                    </td>
                    <td><StatusBadge status={job.status} conclusion={job.conclusion} /></td>
                    <td className="text-muted text-small">
                      {job.steps.filter((s) => s.conclusion === "success").length} / {job.steps.length}
                    </td>
                    <td className="text-muted text-small">{formatDuration(job.startedAt, job.completedAt)}</td>
                    <td className="text-muted text-small mono">{job.runnerName ?? "—"}</td>
                  </tr>
                  {expanded.has(job.id) && (
                    <tr className="job-expansion-row">
                      <td colSpan={5} className="job-expansion-cell">
                        <JobExpansion job={job} owner={owner} repo={repo} runCompleted={runCompleted} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── Job expansion (steps + log tail) ─────────────────────────────────────────

function JobExpansion({
  job, owner, repo, runCompleted,
}: {
  job: WorkflowJob
  owner: string
  repo: string
  runCompleted: boolean
}) {
  const showLogs =
    runCompleted && (job.conclusion === "failure" || job.conclusion === "timed_out")

  return (
    <div className="job-expansion">
      <div className="job-steps">
        {job.steps.map((step) => (
          <div key={step.number} className="job-step">
            <span className={stepDotClass(step)} />
            <span className="job-step-name">{step.name}</span>
            <span className="job-step-duration">
              {step.startedAt ? formatDuration(step.startedAt, step.completedAt) : ""}
            </span>
          </div>
        ))}
      </div>
      {showLogs && (
        <LogTail owner={owner} repo={repo} jobId={job.id} htmlUrl={job.htmlUrl} />
      )}
    </div>
  )
}

function stepDotClass(step: JobStep): string {
  if (step.status === "in_progress") return "run-dot run-dot-running run-dot-pulse"
  if (step.conclusion === "success") return "run-dot run-dot-success"
  if (step.conclusion === "failure") return "run-dot run-dot-failure"
  return "run-dot run-dot-neutral"
}

// ── Log tail ──────────────────────────────────────────────────────────────────

function LogTail({ owner, repo, jobId, htmlUrl }: {
  owner: string
  repo: string
  jobId: number
  htmlUrl: string
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["job-logs", owner, repo, jobId],
    queryFn: () => getJobLogs(owner, repo, jobId),
    staleTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
  })

  return (
    <div className="job-log-preview">
      <div className="job-log-header">
        <span className="text-muted text-small">Log preview (last 30 lines)</span>
        <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="text-small">
          View full logs on GitHub ↗
        </a>
      </div>
      {isLoading && <p className="text-muted text-small" style={{ padding: "0.375rem 0" }}>Loading…</p>}
      {isError && <p className="text-muted text-small" style={{ padding: "0.375rem 0" }}>Logs unavailable.</p>}
      {data && <pre className="job-log-tail">{logTail(data)}</pre>}
    </div>
  )
}

function logTail(raw: string, n = 30): string {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, ""))
    .slice(-n)
    .join("\n")
}

// ── Branch run history card ───────────────────────────────────────────────────

function BranchHistoryCard({
  owner, repo, currentRunId, branch, event,
}: {
  owner: string
  repo: string
  currentRunId: number
  branch: string
  event: string
}) {
  const isSchedule = event === "schedule"
  const { data } = useQuery({
    queryKey: ["runs", `${owner}/${repo}`, "history", isSchedule ? "all" : branch],
    queryFn: () => getRuns(owner, repo, isSchedule ? { per_page: 15 } : { branch, per_page: 15 }),
    staleTime: 2 * 60 * 1000,
  })

  const runs = (data?.runs ?? []).filter((r) => r.id !== currentRunId)
  if (runs.length === 0) return null

  const title = isSchedule
    ? "Recent runs — all branches"
    : `Recent runs on ${branch}`

  return (
    <Card>
      <CardHeader
        title={title}
        actions={
          <Link to="/runs" className="btn btn-sm">
            View all
          </Link>
        }
      />
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Run</th>
              {isSchedule && <th>Branch</th>}
              <th>Commit</th>
              <th>Event</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="text-muted text-small mono">{r.runNumber}</td>
                <td>
                  <Link
                    to="/runs/$owner/$repo/$runId"
                    params={{ owner, repo, runId: String(r.id) }}
                  >
                    {r.displayTitle}
                  </Link>
                </td>
                {isSchedule && (
                  <td>
                    <a
                      href={`https://github.com/${owner}/${repo}/tree/${r.headBranch}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono text-small"
                    >
                      {r.headBranch}
                    </a>
                  </td>
                )}
                <td>
                  <a
                    href={`https://github.com/${owner}/${repo}/commit/${r.headSha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono text-small"
                    title={r.headSha}
                  >
                    {r.headSha.slice(0, 7)}
                  </a>
                </td>
                <td><EventBadge event={r.event} /></td>
                <td><StatusBadge status={r.status} conclusion={r.conclusion} /></td>
                <td className="text-muted text-small">{formatDuration(r.runStartedAt, r.updatedAt)}</td>
                <td className="text-muted text-small" title={formatDateTime(r.runStartedAt ?? r.createdAt)}>
                  {formatRelativeTime(r.runStartedAt ?? r.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
