import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { WorkflowRun } from "../../types/index.js"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => ({
    ...opts,
    useParams: vi.fn(() => ({ owner: "acme", repo: "api" })),
    useSearch: vi.fn(() => ({ page: 1 })),
    fullPath: "/repositories/$owner/$repo/runs",
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to: _to, params: _p, search: _s, ...rest }: any) => (
    <a {...rest}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}))

vi.mock("../../api/index.js", () => ({
  getRuns: vi.fn(),
}))

vi.mock("../../components/ui/Spinner.js", () => ({
  PageSpinner: () => <div data-testid="page-spinner" />,
}))

vi.mock("../../components/ui/Badge.js", () => ({
  StatusBadge: ({ conclusion, status }: { conclusion: string | null; status: string }) => (
    <span data-testid="status-badge">{conclusion ?? status}</span>
  ),
}))

vi.mock("../../components/ui/Button.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}))

vi.mock("../../components/ui/EventBadge.js", () => ({
  EventBadge: ({ event }: { event: string }) => (
    <span data-testid="event-badge">{event}</span>
  ),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Route, RunsList, filterRuns, sortRuns } from "./repositories.$owner.$repo.runs.js"
import type { SortKey } from "./repositories.$owner.$repo.runs.js"

const mockUseQuery = vi.mocked(useQuery)

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
beforeEach(() => {
  _id = 0
  vi.clearAllMocks()
  mockNavigate.mockReturnValue(() => {})
})

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: ++_id,
    name: "CI",
    displayTitle: `Run ${_id}`,
    status: "completed",
    conclusion: "success",
    headBranch: "main",
    headSha: "abc1234def5678",
    runNumber: _id,
    event: "push",
    workflowId: 10,
    workflowPath: ".github/workflows/ci.yml",
    workflowName: "CI",
    repository: "acme/api",
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T10:05:00Z",
    runStartedAt: "2024-01-01T10:00:00Z",
    runAttempt: 1,
    url: "https://api.github.com/runs/1",
    htmlUrl: "https://github.com/acme/api/actions/runs/1",
    actor: { login: "alice", avatarUrl: "" },
    ...overrides,
  }
}

function withSearch(search: Record<string, unknown>) {
  vi.mocked(Route.useSearch).mockReturnValue(search as ReturnType<typeof Route.useSearch>)
}

function withRuns(runs: WorkflowRun[], total = runs.length) {
  mockUseQuery.mockReturnValue({
    data: { runs, total },
    isLoading: false,
  } as ReturnType<typeof useQuery>)
}

// ── filterRuns — pure unit tests ──────────────────────────────────────────────

describe("filterRuns", () => {
  it("returns all runs when query is empty string", () => {
    const runs = [makeRun(), makeRun()]
    expect(filterRuns(runs, "")).toHaveLength(2)
  })

  it("matches by workflowName (case-insensitive)", () => {
    const runs = [
      makeRun({ workflowName: "Deploy Production" }),
      makeRun({ workflowName: "CI" }),
    ]
    expect(filterRuns(runs, "deploy")).toHaveLength(1)
    expect(filterRuns(runs, "DEPLOY PRODUCTION")).toHaveLength(1)
  })

  it("matches partial workflowName", () => {
    const runs = [
      makeRun({ workflowName: "Nightly Dependency audit" }),
      makeRun({ workflowName: "CI" }),
    ]
    expect(filterRuns(runs, "Night")).toHaveLength(1)
    expect(filterRuns(runs, "audit")).toHaveLength(1)
  })

  it("matches by headBranch", () => {
    const runs = [
      makeRun({ headBranch: "feature/my-feature" }),
      makeRun({ headBranch: "main" }),
    ]
    expect(filterRuns(runs, "feature")).toHaveLength(1)
    expect(filterRuns(runs, "my-feature")).toHaveLength(1)
  })

  it("matches by headSha (full SHA)", () => {
    const runs = [
      makeRun({ headSha: "aabbccdd11223344" }),
      makeRun({ headSha: "ffffeeeeddddcccc" }),
    ]
    expect(filterRuns(runs, "aabbccdd")).toHaveLength(1)
  })

  it("matches by headSha prefix (short SHA)", () => {
    const runs = [makeRun({ headSha: "deadbeef12345678" })]
    expect(filterRuns(runs, "deadbe")).toHaveLength(1)
    expect(filterRuns(runs, "xxxxxx")).toHaveLength(0)
  })

  it("matches by actor login", () => {
    const runs = [
      makeRun({ actor: { login: "alice", avatarUrl: "" } }),
      makeRun({ actor: { login: "bob", avatarUrl: "" } }),
    ]
    expect(filterRuns(runs, "alice")).toHaveLength(1)
    expect(filterRuns(runs, "ALI")).toHaveLength(1)
  })

  it("handles null actor without throwing", () => {
    const runs = [makeRun({ actor: null })]
    expect(() => filterRuns(runs, "alice")).not.toThrow()
    expect(filterRuns(runs, "alice")).toHaveLength(0)
  })

  it("matches by status", () => {
    const runs = [
      makeRun({ status: "in_progress", conclusion: null }),
      makeRun({ status: "completed", conclusion: "success" }),
    ]
    expect(filterRuns(runs, "in_progress")).toHaveLength(1)
    expect(filterRuns(runs, "completed")).toHaveLength(1)
  })

  it("matches by conclusion", () => {
    const runs = [
      makeRun({ status: "completed", conclusion: "failure" }),
      makeRun({ status: "completed", conclusion: "success" }),
    ]
    expect(filterRuns(runs, "failure")).toHaveLength(1)
    expect(filterRuns(runs, "success")).toHaveLength(1)
  })

  it("handles null conclusion without throwing", () => {
    const runs = [makeRun({ conclusion: null })]
    expect(() => filterRuns(runs, "success")).not.toThrow()
    expect(filterRuns(runs, "success")).toHaveLength(0)
  })

  it("returns empty array when nothing matches", () => {
    const runs = [makeRun({ workflowName: "CI", headBranch: "main" })]
    expect(filterRuns(runs, "zzznomatch")).toHaveLength(0)
  })

  it("matches across different fields in different runs", () => {
    const runs = [
      makeRun({ workflowName: "Deploy", headBranch: "main" }),
      makeRun({ workflowName: "CI", headBranch: "deploy/hotfix" }),
    ]
    // "deploy" matches workflowName of run 1 AND headBranch of run 2
    expect(filterRuns(runs, "deploy")).toHaveLength(2)
  })

  it("a single run matching multiple fields is returned once", () => {
    const runs = [makeRun({ workflowName: "deploy", headBranch: "deploy" })]
    expect(filterRuns(runs, "deploy")).toHaveLength(1)
  })
})

// ── sortRuns — pure unit tests ────────────────────────────────────────────────

describe("sortRuns", () => {
  function s(key: SortKey, dir: "asc" | "desc" = "asc") {
    return (runs: ReturnType<typeof makeRun>[]) => sortRuns(runs, key, dir)
  }

  it("sorts by runNumber asc", () => {
    const runs = [makeRun({ runNumber: 3 }), makeRun({ runNumber: 1 }), makeRun({ runNumber: 2 })]
    expect(s("runNumber")(runs).map((r) => r.runNumber)).toEqual([1, 2, 3])
  })

  it("sorts by runNumber desc", () => {
    const runs = [makeRun({ runNumber: 1 }), makeRun({ runNumber: 3 }), makeRun({ runNumber: 2 })]
    expect(s("runNumber", "desc")(runs).map((r) => r.runNumber)).toEqual([3, 2, 1])
  })

  it("sorts by displayTitle asc (case-insensitive locale)", () => {
    const runs = [makeRun({ displayTitle: "Zebra" }), makeRun({ displayTitle: "Alpha" })]
    expect(s("displayTitle")(runs).map((r) => r.displayTitle)).toEqual(["Alpha", "Zebra"])
  })

  it("sorts by workflowName asc", () => {
    const runs = [makeRun({ workflowName: "Release" }), makeRun({ workflowName: "CI" })]
    expect(s("workflowName")(runs).map((r) => r.workflowName)).toEqual(["CI", "Release"])
  })

  it("sorts by headBranch asc", () => {
    const runs = [makeRun({ headBranch: "main" }), makeRun({ headBranch: "develop" })]
    expect(s("headBranch")(runs).map((r) => r.headBranch)).toEqual(["develop", "main"])
  })

  it("sorts by event asc alphabetically", () => {
    const runs = [
      makeRun({ event: "workflow_dispatch" }),
      makeRun({ event: "push" }),
      makeRun({ event: "schedule" }),
    ]
    expect(s("event")(runs).map((r) => r.event)).toEqual(["push", "schedule", "workflow_dispatch"])
  })

  it("sorts by actor login asc", () => {
    const runs = [
      makeRun({ actor: { login: "zara", avatarUrl: "" } }),
      makeRun({ actor: { login: "alice", avatarUrl: "" } }),
    ]
    expect(s("actor")(runs).map((r) => r.actor?.login)).toEqual(["alice", "zara"])
  })

  it("sorts null actor as empty string (last asc)", () => {
    const runs = [
      makeRun({ actor: null }),
      makeRun({ actor: { login: "alice", avatarUrl: "" } }),
    ]
    expect(s("actor")(runs).map((r) => r.actor?.login ?? "")).toEqual(["", "alice"])
  })

  it("sorts by status asc: running → failure → cancelled → success", () => {
    const runs = [
      makeRun({ status: "completed", conclusion: "success" }),
      makeRun({ status: "in_progress", conclusion: null }),
      makeRun({ status: "completed", conclusion: "cancelled" }),
      makeRun({ status: "completed", conclusion: "failure" }),
    ]
    const sorted = s("status")(runs)
    expect(sorted.map((r) => r.conclusion ?? r.status)).toEqual([
      "in_progress", "failure", "cancelled", "success",
    ])
  })

  it("sorts by status desc: success → cancelled → failure → running", () => {
    const runs = [
      makeRun({ status: "in_progress", conclusion: null }),
      makeRun({ status: "completed", conclusion: "failure" }),
      makeRun({ status: "completed", conclusion: "success" }),
    ]
    const sorted = s("status", "desc")(runs)
    expect(sorted.map((r) => r.conclusion ?? r.status)).toEqual([
      "success", "failure", "in_progress",
    ])
  })

  it("sorts by duration asc (shorter first)", () => {
    const runs = [
      makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:10:00Z" }), // 10 min
      makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:02:00Z" }), // 2 min
    ]
    const sorted = s("duration")(runs)
    const durations = sorted.map(
      (r) => new Date(r.updatedAt).getTime() - new Date(r.runStartedAt!).getTime()
    )
    expect(durations[0]).toBeLessThan(durations[1]!)
  })

  it("sorts by duration desc (longer first)", () => {
    const runs = [
      makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:02:00Z" }), // 2 min
      makeRun({ runStartedAt: "2024-01-01T10:00:00Z", updatedAt: "2024-01-01T10:10:00Z" }), // 10 min
    ]
    const sorted = s("duration", "desc")(runs)
    const durations = sorted.map(
      (r) => new Date(r.updatedAt).getTime() - new Date(r.runStartedAt!).getTime()
    )
    expect(durations[0]).toBeGreaterThan(durations[1]!)
  })

  it("sorts by started asc (oldest first)", () => {
    const runs = [
      makeRun({ runStartedAt: "2024-03-01T00:00:00Z" }),
      makeRun({ runStartedAt: "2024-01-01T00:00:00Z" }),
    ]
    expect(s("started")(runs).map((r) => r.runStartedAt)).toEqual([
      "2024-01-01T00:00:00Z",
      "2024-03-01T00:00:00Z",
    ])
  })

  it("sorts by started desc (newest first)", () => {
    const runs = [
      makeRun({ runStartedAt: "2024-01-01T00:00:00Z" }),
      makeRun({ runStartedAt: "2024-03-01T00:00:00Z" }),
    ]
    expect(s("started", "desc")(runs).map((r) => r.runStartedAt)).toEqual([
      "2024-03-01T00:00:00Z",
      "2024-01-01T00:00:00Z",
    ])
  })

  it("does not mutate the original array", () => {
    const runs = [makeRun({ runNumber: 2 }), makeRun({ runNumber: 1 })]
    const original = runs.map((r) => r.runNumber)
    sortRuns(runs, "runNumber", "asc")
    expect(runs.map((r) => r.runNumber)).toEqual(original)
  })
})

// ── Filter input ──────────────────────────────────────────────────────────────

describe("RunsList — filter input", () => {
  it("renders a single filter input with the combined placeholder", () => {
    withSearch({ page: 1 })
    withRuns([])
    render(<RunsList />)
    expect(
      screen.getByPlaceholderText(
        "Search here...",
      ),
    ).toBeInTheDocument()
  })

  it("input is empty when q search param is absent", () => {
    withSearch({ page: 1 })
    withRuns([])
    render(<RunsList />)
    const input = screen.getByPlaceholderText(
      "Search here...",
    ) as HTMLInputElement
    expect(input.value).toBe("")
  })

  it("pre-fills the input when q is set (e.g. from WorkflowsCard link)", () => {
    withSearch({ page: 1, q: "Nightly Dependency audit" })
    withRuns([])
    render(<RunsList />)
    const input = screen.getByPlaceholderText(
      "Search here...",
    ) as HTMLInputElement
    expect(input.value).toBe("Nightly Dependency audit")
  })

  it("typing calls navigate with updated q and resets page to 1", () => {
    withSearch({ page: 1 })
    withRuns([])
    render(<RunsList />)
    fireEvent.change(
      screen.getByPlaceholderText("Search here..."),
      { target: { value: "main" } },
    )
    expect(mockNavigate).toHaveBeenCalledOnce()
    const { search } = mockNavigate.mock.calls[0]![0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    const updated = search({ page: 3 })
    expect(updated.q).toBe("main")
    expect(updated.page).toBe(1)
  })

  it("clearing the input sets q to undefined", () => {
    withSearch({ page: 1, q: "CI" })
    withRuns([])
    render(<RunsList />)
    fireEvent.change(
      screen.getByPlaceholderText("Search here..."),
      { target: { value: "" } },
    )
    const { search } = mockNavigate.mock.calls[0]![0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    expect(search({}).q).toBeUndefined()
  })

  it("only one filter input is rendered (no branch or status inputs)", () => {
    withSearch({ page: 1 })
    withRuns([])
    render(<RunsList />)
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
  })
})

// ── Client-side filtering in the table ───────────────────────────────────────

describe("RunsList — filtered table output", () => {
  it("shows all runs when q is not set", () => {
    withSearch({ page: 1 })
    withRuns([
      makeRun({ displayTitle: "Run A", workflowName: "CI" }),
      makeRun({ displayTitle: "Run B", workflowName: "Deploy" }),
    ])
    render(<RunsList />)
    expect(screen.getByText("Run A")).toBeInTheDocument()
    expect(screen.getByText("Run B")).toBeInTheDocument()
  })

  it("hides runs that don't match the query", () => {
    withSearch({ page: 1, q: "deploy" })
    withRuns([
      makeRun({ displayTitle: "Run A", workflowName: "CI" }),
      makeRun({ displayTitle: "Run B", workflowName: "Deploy" }),
    ])
    render(<RunsList />)
    expect(screen.queryByText("Run A")).not.toBeInTheDocument()
    expect(screen.getByText("Run B")).toBeInTheDocument()
  })

  it("filters by branch", () => {
    withSearch({ page: 1, q: "feature/x" })
    withRuns([
      makeRun({ displayTitle: "Run A", headBranch: "feature/x", workflowName: "CI" }),
      makeRun({ displayTitle: "Run B", headBranch: "main", workflowName: "CI" }),
    ])
    render(<RunsList />)
    expect(screen.getByText("Run A")).toBeInTheDocument()
    expect(screen.queryByText("Run B")).not.toBeInTheDocument()
  })

  it("filters by commit SHA prefix", () => {
    withSearch({ page: 1, q: "deadbeef" })
    withRuns([
      makeRun({ displayTitle: "Run A", headSha: "deadbeef12345678" }),
      makeRun({ displayTitle: "Run B", headSha: "aaaabbbbccccdddd" }),
    ])
    render(<RunsList />)
    expect(screen.getByText("Run A")).toBeInTheDocument()
    expect(screen.queryByText("Run B")).not.toBeInTheDocument()
  })

  it("filters by actor login", () => {
    withSearch({ page: 1, q: "alice" })
    withRuns([
      makeRun({ displayTitle: "Run A", actor: { login: "alice", avatarUrl: "" } }),
      makeRun({ displayTitle: "Run B", actor: { login: "bob", avatarUrl: "" } }),
    ])
    render(<RunsList />)
    expect(screen.getByText("Run A")).toBeInTheDocument()
    expect(screen.queryByText("Run B")).not.toBeInTheDocument()
  })

  it("filters by status", () => {
    withSearch({ page: 1, q: "in_progress" })
    withRuns([
      makeRun({ displayTitle: "Run A", status: "in_progress", conclusion: null }),
      makeRun({ displayTitle: "Run B", status: "completed", conclusion: "success" }),
    ])
    render(<RunsList />)
    expect(screen.getByText("Run A")).toBeInTheDocument()
    expect(screen.queryByText("Run B")).not.toBeInTheDocument()
  })

  it("filters by conclusion", () => {
    withSearch({ page: 1, q: "failure" })
    withRuns([
      makeRun({ displayTitle: "Run A", status: "completed", conclusion: "failure" }),
      makeRun({ displayTitle: "Run B", status: "completed", conclusion: "success" }),
    ])
    render(<RunsList />)
    expect(screen.getByText("Run A")).toBeInTheDocument()
    expect(screen.queryByText("Run B")).not.toBeInTheDocument()
  })

  it("shows empty state when filter matches nothing", () => {
    withSearch({ page: 1, q: "zzznomatch" })
    withRuns([makeRun({ workflowName: "CI" })])
    render(<RunsList />)
    expect(screen.getByText("No runs found.")).toBeInTheDocument()
  })
})

// ── Pagination ────────────────────────────────────────────────────────────────

describe("RunsList — pagination", () => {
  it("shows pagination when no filter is active and total > 30", () => {
    withSearch({ page: 1 })
    mockUseQuery.mockReturnValue({
      data: { runs: [makeRun()], total: 90 },
      isLoading: false,
    } as ReturnType<typeof useQuery>)
    render(<RunsList />)
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument()
  })

  it("hides pagination when a filter is active", () => {
    withSearch({ page: 1, q: "CI" })
    mockUseQuery.mockReturnValue({
      data: { runs: Array.from({ length: 5 }, () => makeRun({ workflowName: "CI" })), total: 300 },
      isLoading: false,
    } as ReturnType<typeof useQuery>)
    render(<RunsList />)
    expect(screen.queryByText(/Page/)).not.toBeInTheDocument()
  })
})

// ── Basic states ──────────────────────────────────────────────────────────────

describe("RunsList — basic states", () => {
  it("shows spinner while loading", () => {
    withSearch({ page: 1 })
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useQuery>)
    render(<RunsList />)
    expect(screen.getByTestId("page-spinner")).toBeInTheDocument()
  })

  it("shows empty state when no runs are returned", () => {
    withSearch({ page: 1 })
    withRuns([])
    render(<RunsList />)
    expect(screen.getByText("No runs found.")).toBeInTheDocument()
  })

  it("renders the Workflow column header", () => {
    withSearch({ page: 1 })
    withRuns([makeRun()])
    render(<RunsList />)
    expect(screen.getByRole("columnheader", { name: "Workflow" })).toBeInTheDocument()
  })

  it("shows workflowName in each row", () => {
    withSearch({ page: 1 })
    withRuns([makeRun({ workflowName: "Release Pipeline" })])
    render(<RunsList />)
    expect(screen.getByText("Release Pipeline")).toBeInTheDocument()
  })

  it("breadcrumb renders owner and repo as separate items, not combined", () => {
    withSearch({ page: 1 })
    withRuns([])
    render(<RunsList />)
    // owner and repo appear as separate text nodes
    expect(screen.getByText("acme")).toBeInTheDocument()
    expect(screen.getByText("api")).toBeInTheDocument()
    // they are NOT rendered as a combined "acme/api" string
    expect(screen.queryByText("acme/api")).not.toBeInTheDocument()
  })

  it("all column headers are clickable", () => {
    withSearch({ page: 1 })
    withRuns([makeRun()])
    render(<RunsList />)
    for (const name of ["#", "Run", "Workflow", "Branch / Commit", "Event", "Actor", "Status", "Duration", "Started"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument()
    }
  })
})

// ── Sort ──────────────────────────────────────────────────────────────────────

describe("RunsList — column sort", () => {
  it("clicking a column header sorts rows by that column", () => {
    withSearch({ page: 1 })
    withRuns([
      makeRun({ workflowName: "Zebra", displayTitle: "Run 1" }),
      makeRun({ workflowName: "Alpha", displayTitle: "Run 2" }),
    ])
    render(<RunsList />)
    fireEvent.click(screen.getByRole("columnheader", { name: "Workflow" }))
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("Alpha")
    expect(rows[1]).toHaveTextContent("Zebra")
  })

  it("clicking the same header again reverses sort direction", () => {
    withSearch({ page: 1 })
    withRuns([
      makeRun({ workflowName: "Alpha" }),
      makeRun({ workflowName: "Zebra" }),
    ])
    render(<RunsList />)
    const header = screen.getByRole("columnheader", { name: "Workflow" })
    fireEvent.click(header) // first click: asc → Alpha, Zebra
    fireEvent.click(header) // second click: desc → Zebra, Alpha
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("Zebra")
    expect(rows[1]).toHaveTextContent("Alpha")
  })

  it("clicking a different header resets to that column's default direction", () => {
    withSearch({ page: 1 })
    withRuns([
      makeRun({ workflowName: "Alpha", headBranch: "main" }),
      makeRun({ workflowName: "Zebra", headBranch: "develop" }),
    ])
    render(<RunsList />)
    fireEvent.click(screen.getByRole("columnheader", { name: "Branch / Commit" }))
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("develop")
    expect(rows[1]).toHaveTextContent("main")
  })
})
