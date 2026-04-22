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

// ── WorkflowDAG rendering ─────────────────────────────────────────────────────

describe("WorkflowDAG", () => {
  it("shows empty state when no jobs", () => {
    render(<WorkflowDAG jobs={[]} />)
    expect(screen.getByText("No jobs to display.")).toBeInTheDocument()
  })

  it("renders a pill for each job", () => {
    const jobs = [makeJob({ name: "build" }), makeJob({ name: "test" })]
    render(<WorkflowDAG jobs={jobs} />)
    expect(screen.getByText("build")).toBeInTheDocument()
    expect(screen.getByText("test")).toBeInTheDocument()
  })

  it("renders arrows between jobs", () => {
    const jobs = [makeJob({ name: "check" }), makeJob({ name: "build" }), makeJob({ name: "deploy" })]
    render(<WorkflowDAG jobs={jobs} />)
    expect(screen.getAllByText("→")).toHaveLength(2)
  })

  it("renders no arrow for a single job", () => {
    render(<WorkflowDAG jobs={[makeJob({ name: "build" })]} />)
    expect(screen.queryByText("→")).not.toBeInTheDocument()
  })

  it("renders jobs in startedAt order", () => {
    const a = makeJob({ name: "validate", startedAt: "2024-01-01T10:00:00Z" })
    const b = makeJob({ name: "deploy",   startedAt: "2024-01-01T10:20:00Z" })
    render(<WorkflowDAG jobs={[b, a]} />)
    const pills = screen.getAllByText(/validate|deploy/)
    expect(pills[0]).toHaveTextContent("validate")
    expect(pills[1]).toHaveTextContent("deploy")
  })
})
