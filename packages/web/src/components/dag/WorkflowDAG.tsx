import { Fragment } from "react"
import { runStatusVariant, formatDuration } from "../../lib/utils.js"
import type { WorkflowJob } from "../../types/index.js"

interface WorkflowDAGProps {
  jobs: WorkflowJob[]
}

// ── Ordering ──────────────────────────────────────────────────────────────────

/** Returns jobs sorted by startedAt, with not-yet-started jobs at the end. */
export function sortJobs(jobs: WorkflowJob[]): WorkflowJob[] {
  return [...jobs].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0
    if (!a.startedAt) return 1
    if (!b.startedAt) return -1
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  })
}

// ── Job pill ──────────────────────────────────────────────────────────────────

const COLOR: Record<string, string> = {
  success:   "var(--color-success)",
  failure:   "var(--color-failure)",
  running:   "var(--color-running)",
  cancelled: "var(--color-cancelled)",
  neutral:   "var(--color-neutral)",
  pending:   "var(--color-neutral)",
}

function JobPill({ job }: { job: WorkflowJob }) {
  const variant = runStatusVariant(job.status, job.conclusion)
  const color = COLOR[variant] ?? "var(--color-border)"
  const duration = formatDuration(job.startedAt, job.completedAt)

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.375rem 0.75rem",
        borderRadius: "var(--radius)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${color}`,
        background: "var(--color-bg-secondary)",
        fontSize: 12,
        fontWeight: 500,
        minWidth: 0,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "22ch" }}>
        {job.name}
      </span>
      {duration && (
        <span style={{ color: "var(--color-text-muted)", fontWeight: 400, flexShrink: 0 }}>
          {duration}
        </span>
      )}
    </div>
  )
}

// ── DAG ───────────────────────────────────────────────────────────────────────

export function WorkflowDAG({ jobs }: WorkflowDAGProps) {
  if (jobs.length === 0) {
    return <p className="empty-state">No jobs to display.</p>
  }

  const sorted = sortJobs(jobs)

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          padding: "0.25rem 0",
        }}
      >
        {sorted.map((job, i) => (
          <Fragment key={job.id}>
            {i > 0 && (
              <span
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: 16,
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                →
              </span>
            )}
            <JobPill job={job} />
          </Fragment>
        ))}
      </div>
    </div>
  )
}
