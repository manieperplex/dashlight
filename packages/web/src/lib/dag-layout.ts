import type { WorkflowJob } from "../types/index.js"

export interface DagNode {
  job: WorkflowJob
  level: number // column index (0 = leftmost)
  row: number   // row within column (0 = top, centred across all columns)
}

export interface DagEdge {
  fromId: number
  toId: number
}

export interface DagLayout {
  nodes: DagNode[]
  edges: DagEdge[]
  levelCount: number // total columns
  maxRows: number    // max jobs in any single column
}

/**
 * Milliseconds of tolerance when deciding whether job A finished "just before"
 * job B started. Absorbs GitHub scheduler jitter (jobs in the same wave
 * typically start within 1–2 s of each other).
 */
export const SCHEDULE_TOLERANCE_MS = 5_000

/**
 * Build a parallel DAG layout from job execution timing.
 *
 * Algorithm: sort jobs by startedAt, then assign each job a level equal to
 * (max level of predecessors) + 1. A job P is a predecessor of job J when
 * P.completedAt ≤ J.startedAt + SCHEDULE_TOLERANCE_MS — meaning P had
 * finished (or nearly finished) before J began. Two jobs that started before
 * either completed land on the same level and are rendered side-by-side.
 *
 * Edges are drawn between every job in level N and every job in level N+1.
 * Without the GitHub `needs` field this is an approximation; it is exact for
 * the common single-chain and fan-out/fan-in patterns.
 *
 * Returns null when:
 * - fewer than 2 jobs are provided
 * - no job has a startedAt timestamp
 * - all jobs land in a single column (no parallelism to visualise)
 */
export function buildDagLayout(jobs: WorkflowJob[]): DagLayout | null {
  if (jobs.length < 2) return null
  if (!jobs.some(j => j.startedAt)) return null

  const sorted = [...jobs].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0
    if (!a.startedAt) return 1
    if (!b.startedAt) return -1
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  })

  // ── Level assignment ──────────────────────────────────────────────────────
  const levelOf = new Map<number, number>() // jobId → column

  for (const job of sorted) {
    if (!job.startedAt) {
      // Pending job: place one column after the last assigned job
      const maxSoFar = levelOf.size > 0 ? Math.max(...levelOf.values()) : -1
      levelOf.set(job.id, maxSoFar + 1)
      continue
    }

    const startMs = new Date(job.startedAt).getTime()
    let level = 0

    for (const [prevId, prevLevel] of levelOf) {
      const prev = jobs.find(j => j.id === prevId)!
      if (!prev.completedAt) continue
      const endMs = new Date(prev.completedAt).getTime()
      if (endMs <= startMs + SCHEDULE_TOLERANCE_MS) {
        level = Math.max(level, prevLevel + 1)
      }
    }

    levelOf.set(job.id, level)
  }

  // ── Group by level ────────────────────────────────────────────────────────
  const byLevel = new Map<number, WorkflowJob[]>()
  for (const job of jobs) {
    const lv = levelOf.get(job.id) ?? 0
    if (!byLevel.has(lv)) byLevel.set(lv, [])
    byLevel.get(lv)!.push(job)
  }

  const maxRows = Math.max(...[...byLevel.values()].map(g => g.length))
  if (maxRows < 2) return null // no parallelism — linear is equivalent

  const levelCount = Math.max(...byLevel.keys()) + 1

  // ── Row assignment (centre each column vertically) ────────────────────────
  const nodes: DagNode[] = []
  for (const [level, group] of [...byLevel.entries()].sort(([a], [b]) => a - b)) {
    const offset = Math.floor((maxRows - group.length) / 2)
    group.forEach((job, i) => nodes.push({ job, level, row: offset + i }))
  }

  // ── Edges: every job in level N → every job in level N+1 ─────────────────
  const edges: DagEdge[] = []
  for (let lv = 0; lv < levelCount - 1; lv++) {
    const froms = byLevel.get(lv) ?? []
    const tos   = byLevel.get(lv + 1) ?? []
    for (const f of froms) {
      for (const t of tos) {
        edges.push({ fromId: f.id, toId: t.id })
      }
    }
  }

  return { nodes, edges, levelCount, maxRows }
}
