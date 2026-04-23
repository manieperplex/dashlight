import { describe, it, expect } from "vitest"
import { buildDagLayout, SCHEDULE_TOLERANCE_MS } from "./dag-layout.js"
import type { WorkflowJob } from "../types/index.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
function makeJob(overrides: Partial<WorkflowJob> = {}): WorkflowJob {
  return {
    id: ++_id,
    name: `Job ${_id}`,
    status: "completed",
    conclusion: "success",
    startedAt: null,
    completedAt: null,
    steps: [],
    runnerName: "ubuntu-latest",
    labels: [],
    htmlUrl: "https://github.com",
    ...overrides,
  }
}

/** Offset a base ISO timestamp by `ms` milliseconds. */
function addMs(base: string, ms: number): string {
  return new Date(new Date(base).getTime() + ms).toISOString()
}

const BASE = "2024-01-01T10:00:00.000Z"

// ── Null-return cases ─────────────────────────────────────────────────────────

describe("buildDagLayout — null cases", () => {
  it("returns null for 0 jobs", () => {
    expect(buildDagLayout([])).toBeNull()
  })

  it("returns null for 1 job", () => {
    const job = makeJob({ startedAt: BASE, completedAt: addMs(BASE, 60_000) })
    expect(buildDagLayout([job])).toBeNull()
  })

  it("returns null when no job has a startedAt timestamp", () => {
    const a = makeJob({ startedAt: null })
    const b = makeJob({ startedAt: null })
    expect(buildDagLayout([a, b])).toBeNull()
  })

  it("returns null when all jobs are sequential (maxRows = 1)", () => {
    // job2 starts 30 s after job1 completes → different levels → 1 job per level
    const job1 = makeJob({ startedAt: BASE,                    completedAt: addMs(BASE, 60_000) })
    const job2 = makeJob({ startedAt: addMs(BASE, 90_000),     completedAt: addMs(BASE, 150_000) })
    const job3 = makeJob({ startedAt: addMs(BASE, 180_000),    completedAt: addMs(BASE, 240_000) })
    expect(buildDagLayout([job1, job2, job3])).toBeNull()
  })
})

// ── Level assignment ──────────────────────────────────────────────────────────

describe("buildDagLayout — level assignment", () => {
  /**
   * Diamond pattern:
   *   build (L0) → test (L1)  ─┐
   *              → lint (L1)  ─┤→ deploy (L2)
   */
  function makeDiamond() {
    const build  = makeJob({ name: "build",  startedAt: BASE,                 completedAt: addMs(BASE,  60_000) })
    const test_  = makeJob({ name: "test",   startedAt: addMs(BASE,  61_000), completedAt: addMs(BASE, 121_000) })
    const lint   = makeJob({ name: "lint",   startedAt: addMs(BASE,  62_000), completedAt: addMs(BASE, 122_000) })
    const deploy = makeJob({ name: "deploy", startedAt: addMs(BASE, 123_000), completedAt: addMs(BASE, 183_000) })
    return { build, test_, lint, deploy, jobs: [build, test_, lint, deploy] }
  }

  it("assigns correct levels in a diamond pattern", () => {
    const { build, test_, lint, deploy, jobs } = makeDiamond()
    const layout = buildDagLayout(jobs)
    expect(layout).not.toBeNull()
    const nodeFor = (id: number) => layout!.nodes.find(n => n.job.id === id)!

    expect(nodeFor(build.id).level).toBe(0)
    expect(nodeFor(test_.id).level).toBe(1)
    expect(nodeFor(lint.id).level).toBe(1)
    expect(nodeFor(deploy.id).level).toBe(2)
  })

  it("sets levelCount to 3 for the diamond pattern", () => {
    const { jobs } = makeDiamond()
    expect(buildDagLayout(jobs)!.levelCount).toBe(3)
  })

  it("sets maxRows to 2 for the diamond pattern", () => {
    const { jobs } = makeDiamond()
    expect(buildDagLayout(jobs)!.maxRows).toBe(2)
  })

  it("respects SCHEDULE_TOLERANCE_MS — jobs within tolerance are treated as sequential", () => {
    // job2 starts exactly at job1.completedAt + tolerance → still a predecessor
    const job1 = makeJob({ startedAt: BASE,                                      completedAt: addMs(BASE, 60_000) })
    const job2 = makeJob({ startedAt: addMs(BASE, 60_000 - SCHEDULE_TOLERANCE_MS), completedAt: addMs(BASE, 120_000) })
    // Two separate levels → maxRows = 1 → null
    expect(buildDagLayout([job1, job2])).toBeNull()
  })

  it("jobs that start before any prior job completes land on the same level", () => {
    // a and b both overlap in time → same level
    const a = makeJob({ startedAt: BASE,               completedAt: addMs(BASE, 60_000) })
    const b = makeJob({ startedAt: addMs(BASE, 1_000), completedAt: addMs(BASE, 61_000) })
    const layout = buildDagLayout([a, b])
    expect(layout).not.toBeNull()
    const [na, nb] = [layout!.nodes.find(n => n.job.id === a.id)!, layout!.nodes.find(n => n.job.id === b.id)!]
    expect(na.level).toBe(nb.level)
  })
})

// ── Row centering ─────────────────────────────────────────────────────────────

describe("buildDagLayout — row centering", () => {
  it("centres a single-job column within the maxRows grid", () => {
    // Diamond: level 1 has 2 jobs (maxRows=2); levels 0 and 2 have 1 job each
    // offset for a 1-job column in a 2-row grid = floor((2-1)/2) = 0
    const build  = makeJob({ startedAt: BASE,                 completedAt: addMs(BASE,  60_000) })
    const test_  = makeJob({ startedAt: addMs(BASE,  61_000), completedAt: addMs(BASE, 121_000) })
    const lint   = makeJob({ startedAt: addMs(BASE,  62_000), completedAt: addMs(BASE, 122_000) })
    const deploy = makeJob({ startedAt: addMs(BASE, 123_000), completedAt: addMs(BASE, 183_000) })
    const layout = buildDagLayout([build, test_, lint, deploy])!
    const nodeFor = (id: number) => layout.nodes.find(n => n.job.id === id)!

    // maxRows=2, single-job column → offset = floor((2-1)/2) = 0
    expect(nodeFor(build.id).row).toBe(0)
    expect(nodeFor(deploy.id).row).toBe(0)
  })

  it("assigns consecutive rows within a multi-job column", () => {
    const build  = makeJob({ startedAt: BASE,                 completedAt: addMs(BASE,  60_000) })
    const test_  = makeJob({ startedAt: addMs(BASE,  61_000), completedAt: addMs(BASE, 121_000) })
    const lint   = makeJob({ startedAt: addMs(BASE,  62_000), completedAt: addMs(BASE, 122_000) })
    const deploy = makeJob({ startedAt: addMs(BASE, 123_000), completedAt: addMs(BASE, 183_000) })
    const layout = buildDagLayout([build, test_, lint, deploy])!
    const nodeFor = (id: number) => layout.nodes.find(n => n.job.id === id)!

    // test and lint are at level 1; their rows should be 0 and 1 (consecutive)
    const rows = [nodeFor(test_.id).row, nodeFor(lint.id).row].sort((a, b) => a - b)
    expect(rows).toEqual([0, 1])
  })
})

// ── Edge generation ───────────────────────────────────────────────────────────

describe("buildDagLayout — edges", () => {
  it("generates N×M edges between adjacent levels", () => {
    // Level 0: [build] (1 job), Level 1: [test, lint] (2 jobs), Level 2: [deploy] (1 job)
    // Expected edges: build→test, build→lint (1×2), test→deploy, lint→deploy (2×1)
    const build  = makeJob({ startedAt: BASE,                 completedAt: addMs(BASE,  60_000) })
    const test_  = makeJob({ startedAt: addMs(BASE,  61_000), completedAt: addMs(BASE, 121_000) })
    const lint   = makeJob({ startedAt: addMs(BASE,  62_000), completedAt: addMs(BASE, 122_000) })
    const deploy = makeJob({ startedAt: addMs(BASE, 123_000), completedAt: addMs(BASE, 183_000) })
    const { edges } = buildDagLayout([build, test_, lint, deploy])!

    const edgeSet = new Set(edges.map(e => `${e.fromId}->${e.toId}`))
    expect(edgeSet.has(`${build.id}->${test_.id}`)).toBe(true)
    expect(edgeSet.has(`${build.id}->${lint.id}`)).toBe(true)
    expect(edgeSet.has(`${test_.id}->${deploy.id}`)).toBe(true)
    expect(edgeSet.has(`${lint.id}->${deploy.id}`)).toBe(true)
    expect(edges).toHaveLength(4)
  })

  it("does not generate edges skipping a level", () => {
    const build  = makeJob({ startedAt: BASE,                 completedAt: addMs(BASE,  60_000) })
    const test_  = makeJob({ startedAt: addMs(BASE,  61_000), completedAt: addMs(BASE, 121_000) })
    const lint   = makeJob({ startedAt: addMs(BASE,  62_000), completedAt: addMs(BASE, 122_000) })
    const deploy = makeJob({ startedAt: addMs(BASE, 123_000), completedAt: addMs(BASE, 183_000) })
    const { edges } = buildDagLayout([build, test_, lint, deploy])!

    const edgeSet = new Set(edges.map(e => `${e.fromId}->${e.toId}`))
    // build should not connect directly to deploy
    expect(edgeSet.has(`${build.id}->${deploy.id}`)).toBe(false)
  })
})

// ── Pending jobs ──────────────────────────────────────────────────────────────

describe("buildDagLayout — pending jobs", () => {
  it("places a pending job one level after the last assigned job", () => {
    // parallel a+b at level 0; pending c should land at level 1
    const a = makeJob({ startedAt: BASE,               completedAt: addMs(BASE, 60_000) })
    const b = makeJob({ startedAt: addMs(BASE, 1_000), completedAt: addMs(BASE, 61_000) })
    const c = makeJob({ startedAt: null, completedAt: null, status: "queued" })
    const layout = buildDagLayout([a, b, c])
    expect(layout).not.toBeNull()
    const nodeC = layout!.nodes.find(n => n.job.id === c.id)!
    expect(nodeC.level).toBe(1)
  })
})
