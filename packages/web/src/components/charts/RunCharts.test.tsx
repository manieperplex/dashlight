import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { RepoActivityChart, paletteColor } from "./RunCharts.js"
import type { WorkflowRun } from "../../types/index.js"

// ── Recharts mock ─────────────────────────────────────────────────────────────

// Recharts relies on browser layout APIs unavailable in jsdom. Stub the
// components used by RepoActivityChart so tests focus on our logic.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
beforeEach(() => { _id = 0 })
afterEach(() => { vi.clearAllMocks() })

function makeRun(overrides: Partial<WorkflowRun> & { createdAt?: string } = {}): WorkflowRun {
  return {
    id: ++_id,
    name: "CI",
    status: "completed",
    conclusion: "success",
    headBranch: "main",
    headSha: "abc1234",
    runNumber: 1,
    event: "push",
    workflowId: 1,
    workflowPath: null,
    workflowName: "CI",
    repository: "owner/repo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runStartedAt: new Date().toISOString(),
    runAttempt: 1,
    url: "https://github.com",
    htmlUrl: "https://github.com",
    actor: null,
    displayTitle: "CI",
    ...overrides,
  }
}

function makeRepoRuns(name: string, runCount = 1) {
  const fullName = `owner/${name}`
  return {
    name,
    fullName,
    runs: Array.from({ length: runCount }, () => makeRun()),
  }
}

// ── paletteColor ──────────────────────────────────────────────────────────────

describe("paletteColor", () => {
  it("returns a non-empty string for index 0", () => {
    expect(paletteColor(0)).toBeTruthy()
  })

  it("wraps around when index exceeds palette length", () => {
    expect(paletteColor(0)).toBe(paletteColor(8))
  })

  it("returns distinct colors for adjacent indices", () => {
    expect(paletteColor(0)).not.toBe(paletteColor(1))
  })
})

// ── RepoActivityChart — empty state ──────────────────────────────────────────

describe("RepoActivityChart — empty state", () => {
  it("shows a no-activity message when all repos have no runs", () => {
    render(<RepoActivityChart repoRuns={[makeRepoRuns("repo-a", 0)]} />)
    expect(screen.getByText(/No run activity/)).toBeInTheDocument()
  })

  it("shows a no-activity message when repoRuns is empty", () => {
    render(<RepoActivityChart repoRuns={[]} />)
    expect(screen.getByText(/No run activity/)).toBeInTheDocument()
  })
})

// ── RepoActivityChart — legend ────────────────────────────────────────────────

describe("RepoActivityChart — legend", () => {
  it("renders a legend item for each active repo", () => {
    const repoRuns = [
      makeRepoRuns("alpha", 1),
      makeRepoRuns("beta", 1),
      makeRepoRuns("gamma", 1),
    ]
    render(<RepoActivityChart repoRuns={repoRuns} />)
    expect(screen.getByText("alpha")).toBeInTheDocument()
    expect(screen.getByText("beta")).toBeInTheDocument()
    expect(screen.getByText("gamma")).toBeInTheDocument()
  })

  it("renders the legend outside the ResponsiveContainer wrapper", () => {
    const repoRuns = [makeRepoRuns("my-repo", 1)]
    const { container } = render(<RepoActivityChart repoRuns={repoRuns} />)
    const legend = container.querySelector(".activity-chart-legend")
    expect(legend).toBeInTheDocument()
    // The legend must NOT be a descendant of the ResponsiveContainer div
    // (which is the first child div — the chart wrapper)
    const chartWrapper = container.firstElementChild?.firstElementChild
    expect(chartWrapper?.contains(legend)).toBe(false)
  })

  it("does not render a legend item for repos with no runs", () => {
    const repoRuns = [
      makeRepoRuns("active", 1),
      makeRepoRuns("inactive", 0),
    ]
    render(<RepoActivityChart repoRuns={repoRuns} />)
    expect(screen.getByText("active")).toBeInTheDocument()
    expect(screen.queryByText("inactive")).not.toBeInTheDocument()
  })

  it("renders with many repos and long names without breaking layout classes", () => {
    const names = Array.from({ length: 10 }, (_, i) =>
      `organisation_with_very_long_name_repo_${i + 1}`
    )
    const repoRuns = names.map((n) => makeRepoRuns(n, 1))
    const { container } = render(<RepoActivityChart repoRuns={repoRuns} />)
    const legend = container.querySelector(".activity-chart-legend")
    expect(legend).toBeInTheDocument()
    const items = container.querySelectorAll(".activity-chart-legend-item")
    expect(items).toHaveLength(10)
    // Every item text is present
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it("assigns a distinct color circle to each legend item", () => {
    const repoRuns = [makeRepoRuns("a", 1), makeRepoRuns("b", 1)]
    const { container } = render(<RepoActivityChart repoRuns={repoRuns} />)
    const circles = container.querySelectorAll(".activity-chart-legend-item circle")
    const fills = Array.from(circles).map((c) => c.getAttribute("fill"))
    expect(fills[0]).toBe(paletteColor(0))
    expect(fills[1]).toBe(paletteColor(1))
    expect(fills[0]).not.toBe(fills[1])
  })
})
