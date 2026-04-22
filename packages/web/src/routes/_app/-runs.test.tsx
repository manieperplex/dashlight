import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { WorkflowRun } from "../../types/index.js"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => opts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, params: _p, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueries: vi.fn(),
}))

vi.mock("../../api/index.js", () => ({
  getRepos: vi.fn(),
  getRuns: vi.fn(),
}))

vi.mock("../../components/ui/Spinner.js", () => ({
  PageSpinner: () => <div data-testid="page-spinner" />,
}))

vi.mock("../../components/ui/Card.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card: ({ children }: any) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CardHeader: ({ title }: any) => <div data-testid="card-header">{title}</div>,
}))

vi.mock("../../components/ui/Badge.js", () => ({
  StatusBadge: ({ status, conclusion }: { status: string; conclusion: string | null }) => (
    <span data-testid="status-badge">{conclusion ?? status}</span>
  ),
}))

vi.mock("../../components/ui/EventBadge.js", () => ({
  EventBadge: ({ event }: { event: string }) => (
    <span data-testid="event-badge" data-event={event}>{event}</span>
  ),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import React from "react"
import { useQuery, useQueries } from "@tanstack/react-query"
import { Route, mergeAndSortRuns, filterRuns, sortRuns, AllRunsTable } from "./runs.js"
import type { RunWithRepo, SortKey } from "./runs.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
beforeEach(() => { _id = 0; vi.clearAllMocks() })

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: ++_id,
    name: "CI",
    displayTitle: "CI run",
    status: "completed",
    conclusion: "success",
    headBranch: "main",
    headSha: "abc1234def5678",
    runNumber: _id,
    event: "push",
    workflowId: 10,
    workflowPath: ".github/workflows/ci.yml",
    workflowName: "CI",
    repository: "owner/repo",
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T10:05:00Z",
    runStartedAt: "2024-01-01T10:00:00Z",
    runAttempt: 1,
    url: "https://api.github.com/runs/1",
    htmlUrl: "https://github.com/owner/repo/actions/runs/1",
    actor: null,
    ...overrides,
  }
}

function entry(run: WorkflowRun, owner = "acme", repo = "api"): RunWithRepo {
  return { run, owner, repo }
}

// ── mergeAndSortRuns ──────────────────────────────────────────────────────────

describe("mergeAndSortRuns", () => {
  it("returns an empty array when given no per-repo arrays", () => {
    expect(mergeAndSortRuns([])).toEqual([])
  })

  it("returns an empty array when all per-repo arrays are empty", () => {
    expect(mergeAndSortRuns([[], []])).toEqual([])
  })

  it("returns a single run unchanged", () => {
    const run = makeRun()
    expect(mergeAndSortRuns([[entry(run)]])).toHaveLength(1)
  })

  it("sorts runs newest first across repos", () => {
    const older = makeRun({ createdAt: "2024-01-01T00:00:00Z" })
    const newer = makeRun({ createdAt: "2024-01-10T00:00:00Z" })
    // Pass in "wrong" order
    const result = mergeAndSortRuns([[entry(older)], [entry(newer)]])
    expect(result[0].run.id).toBe(newer.id)
    expect(result[1].run.id).toBe(older.id)
  })

  it("flattens runs from multiple repos into one list", () => {
    const r1 = makeRun()
    const r2 = makeRun()
    const r3 = makeRun()
    const result = mergeAndSortRuns([[entry(r1), entry(r2)], [entry(r3)]])
    expect(result).toHaveLength(3)
  })

  it("preserves the owner and repo fields alongside each run", () => {
    const run = makeRun()
    const [result] = mergeAndSortRuns([[{ run, owner: "myorg", repo: "myapp" }]])
    expect(result.owner).toBe("myorg")
    expect(result.repo).toBe("myapp")
  })

  it("handles multiple runs within the same repo in sorted order", () => {
    const a = makeRun({ createdAt: "2024-03-01T00:00:00Z" })
    const b = makeRun({ createdAt: "2024-01-01T00:00:00Z" })
    const c = makeRun({ createdAt: "2024-06-01T00:00:00Z" })
    const result = mergeAndSortRuns([[entry(a), entry(b), entry(c)]])
    expect(result.map((r) => r.run.id)).toEqual([c.id, a.id, b.id])
  })
})

// ── AllRunsTable ──────────────────────────────────────────────────────────────

describe("AllRunsTable", () => {
  it("renders all column headers", () => {
    render(<AllRunsTable runs={[entry(makeRun())]} />)
    expect(screen.getByText("Repository")).toBeInTheDocument()
    expect(screen.getByText("Run")).toBeInTheDocument()
    expect(screen.getByText("Workflow")).toBeInTheDocument()
    expect(screen.getByText("Branch / Commit")).toBeInTheDocument()
    expect(screen.getByText("Event")).toBeInTheDocument()
    expect(screen.getByText("Actor")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("Duration")).toBeInTheDocument()
    expect(screen.getByText("Started")).toBeInTheDocument()
  })

  it("renders workflowName in each row", () => {
    const run = makeRun({ workflowName: "Release Pipeline" })
    render(<AllRunsTable runs={[entry(run)]} />)
    expect(screen.getByText("Release Pipeline")).toBeInTheDocument()
  })

  it("renders one row per run", () => {
    const runs = [entry(makeRun()), entry(makeRun()), entry(makeRun())]
    const { container } = render(<AllRunsTable runs={runs} />)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3)
  })

  it("run title links to the standalone run detail page", () => {
    const run = makeRun({ id: 42, displayTitle: "Deploy to prod" })
    render(<AllRunsTable runs={[{ run, owner: "myorg", repo: "myapp" }]} />)
    const link = screen.getByRole("link", { name: "Deploy to prod" })
    expect(link).toHaveAttribute("href", "/runs/$owner/$repo/$runId")
  })

  it("repo name links to the repo detail page", () => {
    render(<AllRunsTable runs={[{ run: makeRun(), owner: "acme", repo: "service" }]} />)
    const link = screen.getByRole("link", { name: "service" })
    expect(link).toBeInTheDocument()
  })

  it("shows owner text alongside repo link", () => {
    render(<AllRunsTable runs={[{ run: makeRun(), owner: "acme", repo: "api" }]} />)
    expect(screen.getByText("acme/")).toBeInTheDocument()
  })

  it("branch name is an anchor linking to the GitHub branch", () => {
    const run = makeRun({ headBranch: "feature/new-thing" })
    render(<AllRunsTable runs={[{ run, owner: "acme", repo: "api" }]} />)
    const branchLink = screen.getByRole("link", { name: "feature/new-thing" })
    expect(branchLink).toHaveAttribute(
      "href",
      "https://github.com/acme/api/tree/feature/new-thing"
    )
    expect(branchLink).toHaveAttribute("target", "_blank")
  })

  it("commit sha is an anchor linking to the GitHub commit", () => {
    const run = makeRun({ headSha: "aabbccddee112233" })
    render(<AllRunsTable runs={[{ run, owner: "acme", repo: "api" }]} />)
    const shaLink = screen.getByRole("link", { name: "aabbccd" })
    expect(shaLink).toHaveAttribute(
      "href",
      "https://github.com/acme/api/commit/aabbccddee112233"
    )
  })

  it("renders an EventBadge for each run", () => {
    const runs = [
      entry(makeRun({ event: "push" })),
      entry(makeRun({ event: "schedule" })),
    ]
    render(<AllRunsTable runs={runs} />)
    const badges = screen.getAllByTestId("event-badge")
    expect(badges.map((b) => b.getAttribute("data-event"))).toEqual(["push", "schedule"])
  })

  it("renders a StatusBadge for each run", () => {
    render(<AllRunsTable runs={[entry(makeRun())]} />)
    expect(screen.getByTestId("status-badge")).toBeInTheDocument()
  })

  it("shows actor login when present", () => {
    const run = makeRun({ actor: { login: "jan", avatarUrl: "" } })
    render(<AllRunsTable runs={[entry(run)]} />)
    expect(screen.getByText("jan")).toBeInTheDocument()
  })

  it("shows '—' when actor is null", () => {
    const run = makeRun({ actor: null })
    render(<AllRunsTable runs={[entry(run)]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows retry attempt badge when runAttempt > 1", () => {
    const run = makeRun({ runAttempt: 2 })
    render(<AllRunsTable runs={[entry(run)]} />)
    expect(screen.getByText("×2")).toBeInTheDocument()
  })

  it("does not show retry badge when runAttempt is 1", () => {
    const run = makeRun({ runAttempt: 1 })
    render(<AllRunsTable runs={[entry(run)]} />)
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })

  it("all column headers are clickable", () => {
    render(<AllRunsTable runs={[entry(makeRun())]} />)
    for (const name of ["Repository", "Run", "Workflow", "Branch / Commit", "Event", "Actor", "Status", "Duration", "Started"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument()
    }
  })

  it("clicking a column header sorts rows by that column", () => {
    const runs = [
      entry(makeRun({ workflowName: "Zebra" })),
      entry(makeRun({ workflowName: "Alpha" })),
    ]
    render(<AllRunsTable runs={runs} />)
    fireEvent.click(screen.getByRole("columnheader", { name: "Workflow" }))
    const rows = screen.getAllByRole("row").slice(1) // skip header
    expect(rows[0]).toHaveTextContent("Alpha")
    expect(rows[1]).toHaveTextContent("Zebra")
  })

  it("clicking the same header again reverses sort direction", () => {
    const runs = [
      entry(makeRun({ workflowName: "Alpha" })),
      entry(makeRun({ workflowName: "Zebra" })),
    ]
    render(<AllRunsTable runs={runs} />)
    const header = screen.getByRole("columnheader", { name: "Workflow" })
    fireEvent.click(header) // first click: asc → Alpha, Zebra
    fireEvent.click(header) // second click: desc → Zebra, Alpha
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("Zebra")
    expect(rows[1]).toHaveTextContent("Alpha")
  })

  it("clicking a different header resets to that column's default direction", () => {
    const runs = [
      entry(makeRun({ workflowName: "Alpha", headBranch: "main" })),
      entry(makeRun({ workflowName: "Zebra", headBranch: "develop" })),
    ]
    render(<AllRunsTable runs={runs} />)
    // sort by branch asc: develop (Zebra), main (Alpha)
    fireEvent.click(screen.getByRole("columnheader", { name: "Branch / Commit" }))
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("develop")
    expect(rows[1]).toHaveTextContent("main")
  })
})

// ── filterRuns ────────────────────────────────────────────────────────────────

describe("filterRuns", () => {
  it("returns all runs when query is empty", () => {
    const runs = [entry(makeRun()), entry(makeRun())]
    expect(filterRuns(runs, "")).toHaveLength(2)
  })

  it("filters by repo name (partial match)", () => {
    const runs = [
      { run: makeRun(), owner: "acme", repo: "api" },
      { run: makeRun(), owner: "acme", repo: "frontend" },
    ]
    expect(filterRuns(runs, "api")).toHaveLength(1)
    expect(filterRuns(runs, "api")[0]?.repo).toBe("api")
  })

  it("filters by owner/repo combined", () => {
    const runs = [
      { run: makeRun(), owner: "acme", repo: "api" },
      { run: makeRun(), owner: "other", repo: "api" },
    ]
    expect(filterRuns(runs, "acme/api")).toHaveLength(1)
  })

  it("filters by display title (case-insensitive)", () => {
    const runs = [
      entry(makeRun({ displayTitle: "Deploy to production" })),
      entry(makeRun({ displayTitle: "Run unit tests" })),
    ]
    expect(filterRuns(runs, "DEPLOY")).toHaveLength(1)
  })

  it("filters by branch name", () => {
    const runs = [
      entry(makeRun({ headBranch: "feature/auth" })),
      entry(makeRun({ headBranch: "main" })),
    ]
    expect(filterRuns(runs, "feature")).toHaveLength(1)
  })

  it("filters by actor login", () => {
    const runs = [
      entry(makeRun({ actor: { login: "alice", avatarUrl: "" } })),
      entry(makeRun({ actor: { login: "bob", avatarUrl: "" } })),
    ]
    expect(filterRuns(runs, "alice")).toHaveLength(1)
  })

  it("returns empty array when nothing matches", () => {
    const runs = [entry(makeRun({ displayTitle: "CI", headBranch: "main" }))]
    expect(filterRuns(runs, "zzznomatch")).toHaveLength(0)
  })

  it("returns all runs when query matches all", () => {
    const runs = [
      entry(makeRun({ headBranch: "main" })),
      entry(makeRun({ headBranch: "main" })),
    ]
    expect(filterRuns(runs, "main")).toHaveLength(2)
  })

  it("handles null actor without throwing", () => {
    const runs = [entry(makeRun({ actor: null }))]
    expect(() => filterRuns(runs, "alice")).not.toThrow()
    expect(filterRuns(runs, "alice")).toHaveLength(0)
  })

  it("filters by workflow name (case-insensitive)", () => {
    const runs = [
      entry(makeRun({ workflowName: "Deploy Production" })),
      entry(makeRun({ workflowName: "CI" })),
    ]
    expect(filterRuns(runs, "deploy")).toHaveLength(1)
    expect(filterRuns(runs, "DEPLOY PRODUCTION")).toHaveLength(1)
  })

  it("filters by partial workflow name", () => {
    const runs = [
      entry(makeRun({ workflowName: "Nightly Dependency audit" })),
      entry(makeRun({ workflowName: "CI" })),
    ]
    expect(filterRuns(runs, "nightly")).toHaveLength(1)
    expect(filterRuns(runs, "audit")).toHaveLength(1)
  })
})

// ── sortRuns ──────────────────────────────────────────────────────────────────

describe("sortRuns (AllRuns)", () => {
  function s(key: SortKey, dir: "asc" | "desc" = "asc") {
    return (runs: RunWithRepo[]) => sortRuns(runs, key, dir)
  }

  it("sorts by repository asc", () => {
    const runs = [
      { run: makeRun(), owner: "zeta", repo: "api" },
      { run: makeRun(), owner: "acme", repo: "api" },
    ]
    expect(s("repository")(runs).map((r) => r.owner)).toEqual(["acme", "zeta"])
  })

  it("sorts by displayTitle asc", () => {
    const runs = [
      entry(makeRun({ displayTitle: "Zebra" })),
      entry(makeRun({ displayTitle: "Alpha" })),
    ]
    expect(s("displayTitle")(runs).map((r) => r.run.displayTitle)).toEqual(["Alpha", "Zebra"])
  })

  it("sorts by workflowName asc", () => {
    const runs = [
      entry(makeRun({ workflowName: "Release" })),
      entry(makeRun({ workflowName: "CI" })),
    ]
    expect(s("workflowName")(runs).map((r) => r.run.workflowName)).toEqual(["CI", "Release"])
  })

  it("sorts by event asc alphabetically", () => {
    const runs = [
      entry(makeRun({ event: "workflow_dispatch" })),
      entry(makeRun({ event: "push" })),
      entry(makeRun({ event: "schedule" })),
    ]
    expect(s("event")(runs).map((r) => r.run.event)).toEqual(["push", "schedule", "workflow_dispatch"])
  })

  it("sorts by status asc: running → failure → cancelled → success", () => {
    const runs = [
      entry(makeRun({ status: "completed", conclusion: "success" })),
      entry(makeRun({ status: "in_progress", conclusion: null })),
      entry(makeRun({ status: "completed", conclusion: "failure" })),
    ]
    const sorted = s("status")(runs)
    expect(sorted.map((r) => r.run.conclusion ?? r.run.status)).toEqual([
      "in_progress", "failure", "success",
    ])
  })

  it("sorts by status desc: success → failure → running", () => {
    const runs = [
      entry(makeRun({ status: "in_progress", conclusion: null })),
      entry(makeRun({ status: "completed", conclusion: "failure" })),
      entry(makeRun({ status: "completed", conclusion: "success" })),
    ]
    const sorted = s("status", "desc")(runs)
    expect(sorted.map((r) => r.run.conclusion ?? r.run.status)).toEqual([
      "success", "failure", "in_progress",
    ])
  })

  it("sorts by started desc (newest first)", () => {
    const runs = [
      entry(makeRun({ runStartedAt: "2024-01-01T00:00:00Z" })),
      entry(makeRun({ runStartedAt: "2024-06-01T00:00:00Z" })),
    ]
    expect(s("started", "desc")(runs).map((r) => r.run.runStartedAt)).toEqual([
      "2024-06-01T00:00:00Z",
      "2024-01-01T00:00:00Z",
    ])
  })

  it("sorts by headBranch asc", () => {
    const runs = [
      entry(makeRun({ headBranch: "main" })),
      entry(makeRun({ headBranch: "develop" })),
    ]
    expect(s("headBranch")(runs).map((r) => r.run.headBranch)).toEqual(["develop", "main"])
  })

  it("sorts by actor login asc", () => {
    const runs = [
      entry(makeRun({ actor: { login: "zara", avatarUrl: "" } })),
      entry(makeRun({ actor: { login: "alice", avatarUrl: "" } })),
    ]
    expect(s("actor")(runs).map((r) => r.run.actor?.login)).toEqual(["alice", "zara"])
  })

  it("sorts by duration desc (longer first)", () => {
    const runs = [
      entry(makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:02:00Z" })), // 2 min
      entry(makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:10:00Z" })), // 10 min
    ]
    const sorted = s("duration", "desc")(runs)
    const durations = sorted.map(
      (r) => new Date(r.run.updatedAt).getTime() - new Date(r.run.runStartedAt!).getTime()
    )
    expect(durations[0]).toBeGreaterThan(durations[1]!)
  })

  it("sorts by duration asc (shorter first)", () => {
    const runs = [
      entry(makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:10:00Z" })), // 10 min
      entry(makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:02:00Z" })), // 2 min
    ]
    const sorted = s("duration")(runs)
    const durations = sorted.map(
      (r) => new Date(r.run.updatedAt).getTime() - new Date(r.run.runStartedAt!).getTime()
    )
    expect(durations[0]).toBeLessThan(durations[1]!)
  })

  it("does not mutate the original array", () => {
    const runs = [
      entry(makeRun({ workflowName: "Z" })),
      entry(makeRun({ workflowName: "A" })),
    ]
    const originalOrder = runs.map((r) => r.run.workflowName)
    sortRuns(runs, "workflowName", "asc")
    expect(runs.map((r) => r.run.workflowName)).toEqual(originalOrder)
  })
})

// ── AllRuns page ──────────────────────────────────────────────────────────────

describe("AllRuns page", () => {
  const AllRuns = Route.component as React.FC

  beforeEach(() => {
    Route.useSearch = vi.fn().mockReturnValue({ filter: "" })
  })

  it("shows spinner while repos are loading", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never)
    vi.mocked(useQueries).mockReturnValue([])
    render(<AllRuns />)
    expect(screen.getByTestId("page-spinner")).toBeInTheDocument()
  })

  it("shows 'All Runs (0)' when repos load but have no runs", () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([])
    render(<AllRuns />)
    expect(screen.getByTestId("card-header")).toHaveTextContent("All Runs (0)")
  })

  it("shows empty state text when there are no runs", () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([])
    render(<AllRuns />)
    expect(screen.getByText("No runs found.")).toBeInTheDocument()
  })

  it("shows 'All Runs (N)' with the correct count when runs are present", () => {
    const repo = { id: 1, fullName: "acme/api" }
    vi.mocked(useQuery).mockReturnValue({ data: [repo], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([
      { data: { runs: [makeRun(), makeRun(), makeRun()], actionsDisabled: false } },
    ] as never)
    render(<AllRuns />)
    expect(screen.getByTestId("card-header")).toHaveTextContent("All Runs (3)")
  })

  it("renders the runs table when runs are present", () => {
    const repo = { id: 1, fullName: "acme/api" }
    vi.mocked(useQuery).mockReturnValue({ data: [repo], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([
      { data: { runs: [makeRun({ displayTitle: "Deploy" })], actionsDisabled: false } },
    ] as never)
    render(<AllRuns />)
    expect(screen.getByText("Deploy")).toBeInTheDocument()
  })

  it("shows filtered count in header when filter is active", () => {
    Route.useSearch = vi.fn().mockReturnValue({ filter: "acme" })
    const repo = { id: 1, fullName: "acme/api" }
    vi.mocked(useQuery).mockReturnValue({ data: [repo], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([
      { data: { runs: [makeRun(), makeRun()], actionsDisabled: false } },
    ] as never)
    render(<AllRuns />)
    expect(screen.getByTestId("card-header")).toHaveTextContent("of 2")
  })

  it("shows filter-specific empty state when filter matches nothing", () => {
    Route.useSearch = vi.fn().mockReturnValue({ filter: "zzznomatch" })
    const repo = { id: 1, fullName: "acme/api" }
    vi.mocked(useQuery).mockReturnValue({ data: [repo], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([
      { data: { runs: [makeRun()], actionsDisabled: false } },
    ] as never)
    render(<AllRuns />)
    expect(screen.getByText(/No runs match/)).toBeInTheDocument()
  })

  it("renders a filter input", () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(useQueries).mockReturnValue([])
    render(<AllRuns />)
    expect(screen.getByPlaceholderText("Search here...")).toBeInTheDocument()
  })
})
