import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { sortJobs, WorkflowDAG } from "./WorkflowDAG.js"
import type { WorkflowJob } from "../../types/index.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
function makeJob(overrides: Partial<WorkflowJob> = {}): WorkflowJob {
  return {
    id: ++_id,
    name: `Job ${_id}`,
    status: "completed",
    conclusion: "success",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: "2024-01-01T10:05:00Z",
    steps: [],
    runnerName: "ubuntu-latest",
    labels: [],
    htmlUrl: "https://github.com",
    ...overrides,
  }
}

function addMs(base: string, ms: number): string {
  return new Date(new Date(base).getTime() + ms).toISOString()
}

const BASE = "2024-01-01T10:00:00.000Z"

/**
 * Build N jobs with strictly sequential timestamps so buildDagLayout returns
 * null (each level has exactly one job → maxRows = 1 → linear fallback).
 */
function makeSequentialJobs(names: string[]): WorkflowJob[] {
  return names.map((name, i) =>
    makeJob({
      name,
      startedAt:   addMs(BASE, i * 90_000),
      completedAt: addMs(BASE, i * 90_000 + 60_000),
    })
  )
}

// ── sortJobs ──────────────────────────────────────────────────────────────────

describe("sortJobs", () => {
  it("returns empty array for no jobs", () => {
    expect(sortJobs([])).toEqual([])
  })

  it("sorts by startedAt ascending", () => {
    const a = makeJob({ name: "first",  startedAt: "2024-01-01T10:00:00Z" })
    const b = makeJob({ name: "second", startedAt: "2024-01-01T10:10:00Z" })
    expect(sortJobs([b, a]).map((j) => j.name)).toEqual(["first", "second"])
  })

  it("places jobs without startedAt at the end", () => {
    const started = makeJob({ name: "started", startedAt: "2024-01-01T10:00:00Z" })
    const pending = makeJob({ name: "pending", startedAt: null })
    expect(sortJobs([pending, started]).map((j) => j.name)).toEqual(["started", "pending"])
  })

  it("keeps multiple pending jobs together at the end", () => {
    const started = makeJob({ name: "started", startedAt: "2024-01-01T10:00:00Z" })
    const p1 = makeJob({ name: "p1", startedAt: null })
    const p2 = makeJob({ name: "p2", startedAt: null })
    const result = sortJobs([p1, started, p2]).map((j) => j.name)
    expect(result[0]).toBe("started")
    expect(result.slice(1)).toEqual(expect.arrayContaining(["p1", "p2"]))
  })

  it("does not mutate the original array", () => {
    const jobs = [
      makeJob({ startedAt: "2024-01-01T10:10:00Z" }),
      makeJob({ startedAt: "2024-01-01T10:00:00Z" }),
    ]
    const originalIds = jobs.map((j) => j.id)
    sortJobs(jobs)
    expect(jobs.map((j) => j.id)).toEqual(originalIds)
  })
})

// ── WorkflowDAG — linear fallback ─────────────────────────────────────────────

describe("WorkflowDAG (linear)", () => {
  it("shows empty state when no jobs", () => {
    render(<WorkflowDAG jobs={[]} />)
    expect(screen.getByText("No jobs to display.")).toBeInTheDocument()
  })

  it("renders a pill for each job", () => {
    const jobs = makeSequentialJobs(["build", "test"])
    render(<WorkflowDAG jobs={jobs} />)
    expect(screen.getByText("build")).toBeInTheDocument()
    expect(screen.getByText("test")).toBeInTheDocument()
  })

  it("renders arrows between jobs", () => {
    const jobs = makeSequentialJobs(["check", "build", "deploy"])
    render(<WorkflowDAG jobs={jobs} />)
    expect(screen.getAllByText("→")).toHaveLength(2)
  })

  it("renders no arrow for a single job", () => {
    render(<WorkflowDAG jobs={[makeJob({ name: "build" })]} />)
    expect(screen.queryByText("→")).not.toBeInTheDocument()
  })

  it("renders jobs in startedAt order", () => {
    const a = makeJob({ name: "validate", startedAt: addMs(BASE, 0),       completedAt: addMs(BASE, 60_000) })
    const b = makeJob({ name: "deploy",   startedAt: addMs(BASE, 90_000),  completedAt: addMs(BASE, 150_000) })
    render(<WorkflowDAG jobs={[b, a]} />)
    const pills = screen.getAllByText(/validate|deploy/)
    expect(pills[0]).toHaveTextContent("validate")
    expect(pills[1]).toHaveTextContent("deploy")
  })

  it("uses the dag-linear container for sequential jobs", () => {
    const jobs = makeSequentialJobs(["build", "test"])
    render(<WorkflowDAG jobs={jobs} />)
    expect(screen.getByTestId("dag-linear")).toBeInTheDocument()
    expect(screen.queryByTestId("dag-parallel")).not.toBeInTheDocument()
  })
})

// ── WorkflowDAG — parallel layout ────────────────────────────────────────────

describe("WorkflowDAG (parallel)", () => {
  /**
   * Diamond: build → [test, lint] → deploy
   *
   * build  started=T+0s,   completed=T+60s
   * test   started=T+61s,  completed=T+121s   ← parallel with lint
   * lint   started=T+62s,  completed=T+122s
   * deploy started=T+123s, completed=T+183s
   */
  function makeDiamondJobs() {
    return [
      makeJob({ name: "build",  startedAt: BASE,                completedAt: addMs(BASE,  60_000) }),
      makeJob({ name: "test",   startedAt: addMs(BASE,  61_000), completedAt: addMs(BASE, 121_000) }),
      makeJob({ name: "lint",   startedAt: addMs(BASE,  62_000), completedAt: addMs(BASE, 122_000) }),
      makeJob({ name: "deploy", startedAt: addMs(BASE, 123_000), completedAt: addMs(BASE, 183_000) }),
    ]
  }

  it("uses the dag-parallel container for parallel jobs", () => {
    render(<WorkflowDAG jobs={makeDiamondJobs()} />)
    expect(screen.getByTestId("dag-parallel")).toBeInTheDocument()
    expect(screen.queryByTestId("dag-linear")).not.toBeInTheDocument()
  })

  it("renders a pill for each job in parallel layout", () => {
    render(<WorkflowDAG jobs={makeDiamondJobs()} />)
    expect(screen.getByText("build")).toBeInTheDocument()
    expect(screen.getByText("test")).toBeInTheDocument()
    expect(screen.getByText("lint")).toBeInTheDocument()
    expect(screen.getByText("deploy")).toBeInTheDocument()
  })

  it("renders SVG bezier edges in parallel layout", () => {
    const { container } = render(<WorkflowDAG jobs={makeDiamondJobs()} />)
    const paths = container.querySelectorAll("svg path")
    // Diamond: 1×2 + 2×1 = 4 edges
    expect(paths.length).toBe(4)
  })

  it("does not render text arrows in parallel layout", () => {
    render(<WorkflowDAG jobs={makeDiamondJobs()} />)
    expect(screen.queryByText("→")).not.toBeInTheDocument()
  })
})
