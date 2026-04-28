import { Fragment } from "react"
import { runStatusVariant, formatDuration } from "../../lib/utils.js"
import { buildDagLayout } from "../../lib/dag-layout.js"
import type { DagLayout } from "../../lib/dag-layout.js"
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
        height: "100%",
        boxSizing: "border-box",
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

// ── Parallel layout constants ─────────────────────────────────────────────────

const NODE_W = 180
const NODE_H = 36
const COL_GAP = 56
const ROW_GAP = 12
const PAD = 8

function nodeX(level: number) { return PAD + level * (NODE_W + COL_GAP) }
function nodeY(row: number)   { return PAD + row   * (NODE_H + ROW_GAP) }

// ── Parallel DAG ──────────────────────────────────────────────────────────────

function ParallelDAG({ layout }: { layout: DagLayout }) {
  const { nodes, edges, levelCount, maxRows } = layout

  const svgW = PAD * 2 + levelCount * NODE_W + (levelCount - 1) * COL_GAP
  const svgH = PAD * 2 + maxRows   * NODE_H + (maxRows - 1)   * ROW_GAP

  const nodeMap = new Map(nodes.map(n => [n.job.id, n]))

  return (
    <div data-testid="dag-parallel" style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", width: svgW, height: svgH }}>
        {/* SVG bezier edges */}
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: svgW,
            height: svgH,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {edges.map(({ fromId, toId }) => {
            const from = nodeMap.get(fromId)
            const to   = nodeMap.get(toId)
            if (!from || !to) return null

            const x1 = nodeX(from.level) + NODE_W
            const y1 = nodeY(from.row)   + NODE_H / 2
            const x2 = nodeX(to.level)
            const y2 = nodeY(to.row)     + NODE_H / 2
            const cx = (x1 + x2) / 2

            return (
              <path
                key={`${fromId}-${toId}`}
                d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={1.5}
              />
            )
          })}
        </svg>

        {/* Absolutely-positioned job pills */}
        {nodes.map(({ job, level, row }) => (
          <div
            key={job.id}
            style={{
              position: "absolute",
              left: nodeX(level),
              top:  nodeY(row),
              width:  NODE_W,
              height: NODE_H,
            }}
          >
            <JobPill job={job} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Linear DAG (fallback) ─────────────────────────────────────────────────────

function LinearDAG({ jobs }: { jobs: WorkflowJob[] }) {
  const sorted = sortJobs(jobs)

  return (
    <div data-testid="dag-linear" style={{ overflowX: "auto" }}>
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

// ── DAG ───────────────────────────────────────────────────────────────────────

export function WorkflowDAG({ jobs }: WorkflowDAGProps) {
  if (jobs.length === 0) {
    return <p className="empty-state">No jobs to display.</p>
  }

  const layout = buildDagLayout(jobs)

  if (layout) {
    return <ParallelDAG layout={layout} />
  }

  return <LinearDAG jobs={jobs} />
}
