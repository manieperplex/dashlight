import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { WorkflowRun, Workflow, SelfHostedRunner } from "../../types/index.js"

// ── Mocks (must precede imports of the module under test) ─────────────────────

const mockUseChildMatches = vi.fn(() => [] as unknown[])

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => ({
    ...opts,
    useParams: vi.fn(() => ({ owner: "acme", repo: "api" })),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to: _to, params: _p, search: _s, ...rest }: any) => <a {...rest}>{children}</a>,
  Outlet: () => <div data-testid="outlet" />,
  useChildMatches: () => mockUseChildMatches(),
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}))

vi.mock("../../api/index.js", () => ({
  getRepo: vi.fn(),
  getRepoScore: vi.fn(),
  getWorkflows: vi.fn(),
  getRuns: vi.fn(),
  getRepoRunners: vi.fn(),
}))

vi.mock("../../components/charts/RunCharts.js", () => ({
  BuildTrendChart: () => <div data-testid="build-trend-chart" />,
  DurationChart: () => <div data-testid="duration-chart" />,
}))

vi.mock("../../components/ui/Spinner.js", () => ({
  PageSpinner: () => <div data-testid="page-spinner" />,
}))

vi.mock("../../components/ui/Badge.js", () => ({
  StatusBadge: ({ status, conclusion }: { status: string; conclusion: string | null }) => (
    <span data-testid="status-badge">{conclusion ?? status}</span>
  ),
  TierBadge: () => <span data-testid="tier-badge" />,
}))

vi.mock("../../components/ui/Button.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))

vi.mock("../../components/ui/Card.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CardHeader: ({ title, actions }: any) => (
    <div data-testid="card-header">
      <span>{title}</span>
      {actions}
    </div>
  ),
}))

vi.mock("../../components/ui/EventBadge.js", () => ({
  EventBadge: ({ event }: { event: string }) => (
    <span data-testid="event-badge" data-event={event}>{event}</span>
  ),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Route, triggersFromRuns, WorkflowsCard, RecentRunsCard, RunnersCard } from "./repositories.$owner.$repo.js"

// ── Test helpers ───────────────────────────────────────────────────────────────

let _id = 0
beforeEach(() => {
  _id = 0
  vi.clearAllMocks()
  mockUseChildMatches.mockReturnValue([])
})

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

function makeRunner(overrides: Partial<SelfHostedRunner> = {}): SelfHostedRunner {
  return {
    id: ++_id,
    name: "runner-1",
    os: "linux",
    status: "online",
    busy: false,
    labels: ["self-hosted", "linux"],
    ...overrides,
  }
}

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  const id = ++_id
  return {
    id,
    name: `Workflow-${id}`,
    path: `.github/workflows/workflow-${id}.yml`,
    state: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    htmlUrl: `https://github.com/owner/repo/actions/workflows/workflow-${id}.yml`,
    badgeUrl: `https://github.com/owner/repo/actions/workflows/workflow-${id}.yml/badge.svg`,
    ...overrides,
  }
}

const mockUseQuery = vi.mocked(useQuery)

// ── triggersFromRuns ──────────────────────────────────────────────────────────

describe("triggersFromRuns", () => {
  it("returns an empty map for no runs", () => {
    expect(triggersFromRuns([])).toEqual(new Map())
  })

  it("maps a single run to its workflow and event", () => {
    const runs = [makeRun({ workflowId: 1, event: "push" })]
    const result = triggersFromRuns(runs)
    expect(result.get(1)).toEqual(["push"])
  })

  it("deduplicates repeated events for the same workflow", () => {
    const runs = [
      makeRun({ workflowId: 1, event: "push" }),
      makeRun({ workflowId: 1, event: "push" }),
      makeRun({ workflowId: 1, event: "pull_request" }),
    ]
    const result = triggersFromRuns(runs)
    expect(result.get(1)).toEqual(["pull_request", "push"])
  })

  it("returns events sorted alphabetically", () => {
    const runs = [
      makeRun({ workflowId: 2, event: "workflow_dispatch" }),
      makeRun({ workflowId: 2, event: "push" }),
      makeRun({ workflowId: 2, event: "pull_request" }),
    ]
    const result = triggersFromRuns(runs)
    expect(result.get(2)).toEqual(["pull_request", "push", "workflow_dispatch"])
  })

  it("keeps triggers separated by workflow", () => {
    const runs = [
      makeRun({ workflowId: 1, event: "push" }),
      makeRun({ workflowId: 2, event: "schedule" }),
    ]
    const result = triggersFromRuns(runs)
    expect(result.get(1)).toEqual(["push"])
    expect(result.get(2)).toEqual(["schedule"])
  })

  it("does not include entries for workflows with no runs", () => {
    const runs = [makeRun({ workflowId: 5, event: "push" })]
    const result = triggersFromRuns(runs)
    expect(result.has(99)).toBe(false)
  })
})

// ── WorkflowsCard ─────────────────────────────────────────────────────────────

describe("WorkflowsCard", () => {
  it("shows empty state when workflows list is empty", () => {
    mockUseQuery
      .mockReturnValueOnce({ data: [], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="owner" repo="repo" />)
    expect(screen.getByText("No workflows found.")).toBeInTheDocument()
  })

  it("renders the Triggers column header", () => {
    const workflow = makeWorkflow()
    mockUseQuery
      .mockReturnValueOnce({ data: [workflow], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="owner" repo="repo" />)
    expect(screen.getByText("Triggers")).toBeInTheDocument()
  })

  it("shows EventBadge for each trigger seen in recent runs", () => {
    const workflow = makeWorkflow({ id: 10 })
    const runs = [
      makeRun({ workflowId: 10, event: "push" }),
      makeRun({ workflowId: 10, event: "pull_request" }),
    ]
    mockUseQuery
      .mockReturnValueOnce({ data: [workflow], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { runs }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="owner" repo="repo" />)
    const badges = screen.getAllByTestId("event-badge")
    const events = badges.map((b) => b.getAttribute("data-event"))
    expect(events).toContain("push")
    expect(events).toContain("pull_request")
  })

  it("shows '—' for a workflow with no runs data", () => {
    const workflow = makeWorkflow({ id: 99 })
    mockUseQuery
      .mockReturnValueOnce({ data: [workflow], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { runs: [] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="owner" repo="repo" />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows '—' when runs query has not resolved yet", () => {
    const workflow = makeWorkflow()
    mockUseQuery
      .mockReturnValueOnce({ data: [workflow], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: undefined, isLoading: true } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="owner" repo="repo" />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("keeps triggers separated per workflow", () => {
    const wf1 = makeWorkflow({ id: 1 })
    const wf2 = makeWorkflow({ id: 2 })
    const runs = [
      makeRun({ workflowId: 1, event: "push" }),
      makeRun({ workflowId: 2, event: "schedule" }),
    ]
    mockUseQuery
      .mockReturnValueOnce({ data: [wf1, wf2], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { runs }, isLoading: false } as ReturnType<typeof useQuery>)
    const { container } = render(<WorkflowsCard owner="owner" repo="repo" />)
    const rows = container.querySelectorAll("tbody tr")
    // wf1 row should show push badge, wf2 row should show schedule badge
    const wf1Badges = rows[0]?.querySelectorAll("[data-testid='event-badge']")
    const wf2Badges = rows[1]?.querySelectorAll("[data-testid='event-badge']")
    expect(wf1Badges?.[0]?.getAttribute("data-event")).toBe("push")
    expect(wf2Badges?.[0]?.getAttribute("data-event")).toBe("schedule")
  })
})

// ── WorkflowsCard — name links ────────────────────────────────────────────────

describe("WorkflowsCard — workflow name links", () => {
  it("renders the workflow name as an internal link (Link mock, no github.com href)", () => {
    const workflow = makeWorkflow({ id: 1, name: "Deploy Production" })
    mockUseQuery
      .mockReturnValueOnce({ data: [workflow], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { runs: [] }, isLoading: false } as ReturnType<typeof useQuery>)
    const { container } = render(<WorkflowsCard owner="acme" repo="api" />)
    // Link mock renders <a> without href; the external ↗ has the github.com href
    const anchors = Array.from(container.querySelectorAll("a"))
    const nameAnchor = anchors.find((a) => a.textContent?.trim() === "Deploy Production")
    expect(nameAnchor).toBeTruthy()
    expect(nameAnchor!.getAttribute("href") ?? "").not.toContain("github.com")
  })

  it("renders an external ↗ icon linking to the workflow file on GitHub", () => {
    const workflow = makeWorkflow({
      id: 1,
      htmlUrl: "https://github.com/acme/api/actions/workflows/deploy.yml",
    })
    mockUseQuery
      .mockReturnValueOnce({ data: [workflow], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { runs: [] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="acme" repo="api" />)
    const icon = screen.getByTitle("Open workflow on GitHub")
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveAttribute("href", "https://github.com/acme/api/actions/workflows/deploy.yml")
    expect(icon).toHaveAttribute("target", "_blank")
  })

  it("each workflow row has an independent name link and external icon", () => {
    const wf1 = makeWorkflow({ id: 1, name: "CI" })
    const wf2 = makeWorkflow({ id: 2, name: "Deploy" })
    mockUseQuery
      .mockReturnValueOnce({ data: [wf1, wf2], isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({ data: { runs: [] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<WorkflowsCard owner="acme" repo="api" />)
    const icons = screen.getAllByTitle("Open workflow on GitHub")
    expect(icons).toHaveLength(2)
  })
})

// ── RecentRunsCard ────────────────────────────────────────────────────────────

describe("RecentRunsCard", () => {
  it("shows empty state when there are no runs", () => {
    mockUseQuery.mockReturnValue({ data: { runs: [] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    expect(screen.getByText("No runs found.")).toBeInTheDocument()
  })

  it("does not render a run number (#) column header", () => {
    mockUseQuery.mockReturnValue({ data: { runs: [makeRun()] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    expect(screen.queryByRole("columnheader", { name: "#" })).not.toBeInTheDocument()
  })

  it("does not display run numbers in cells", () => {
    const run = makeRun({ runNumber: 42 })
    mockUseQuery.mockReturnValue({ data: { runs: [run] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    expect(screen.queryByText("42")).not.toBeInTheDocument()
  })

  it("renders branch name as an anchor linking to the GitHub branch", () => {
    const run = makeRun({ headBranch: "feature/my-branch" })
    mockUseQuery.mockReturnValue({ data: { runs: [run] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    const branchLink = screen.getByRole("link", { name: "feature/my-branch" })
    expect(branchLink).toBeInTheDocument()
    expect(branchLink).toHaveAttribute(
      "href",
      "https://github.com/owner/repo/tree/feature/my-branch"
    )
    expect(branchLink).toHaveAttribute("target", "_blank")
  })

  it("branch link uses the owner and repo from props", () => {
    const run = makeRun({ headBranch: "main" })
    mockUseQuery.mockReturnValue({ data: { runs: [run] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="acme" repo="api-service" />)
    const branchLink = screen.getByRole("link", { name: "main" })
    expect(branchLink.getAttribute("href")).toBe(
      "https://github.com/acme/api-service/tree/main"
    )
  })

  it("still renders run title, status, event and actor columns", () => {
    const run = makeRun({
      displayTitle: "My CI Run",
      event: "push",
      actor: { login: "jan", avatarUrl: "" },
      status: "completed",
      conclusion: "success",
    })
    mockUseQuery.mockReturnValue({ data: { runs: [run] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    expect(screen.getByText("My CI Run")).toBeInTheDocument()
    expect(screen.getByTestId("event-badge")).toBeInTheDocument()
    expect(screen.getByText("jan")).toBeInTheDocument()
    expect(screen.getByTestId("status-badge")).toBeInTheDocument()
  })

  it("shows retry attempt badge when runAttempt > 1", () => {
    const run = makeRun({ runAttempt: 3 })
    mockUseQuery.mockReturnValue({ data: { runs: [run] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    expect(screen.getByText("×3")).toBeInTheDocument()
  })

  it("does not show retry badge when runAttempt is 1", () => {
    const run = makeRun({ runAttempt: 1 })
    mockUseQuery.mockReturnValue({ data: { runs: [run] }, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RecentRunsCard owner="owner" repo="repo" />)
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()
  })
})

// ── RepositoryDetail page ─────────────────────────────────────────────────────

describe("RepositoryDetail page", () => {
  const RepositoryDetail = Route.component as React.FC

  it("shows spinner while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useQuery>)
    render(<RepositoryDetail />)
    expect(screen.getByTestId("page-spinner")).toBeInTheDocument()
  })

  it("shows not-found message when repo data is absent", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RepositoryDetail />)
    expect(screen.getByText("Repository not found.")).toBeInTheDocument()
  })

  it("renders owner in muted span when repo loads", () => {
    mockUseQuery
      .mockReturnValueOnce({ data: { id: 1 }, isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    const { container } = render(<RepositoryDetail />)
    expect(container.querySelector(".health-repo-label-owner")?.textContent).toBe("acme/")
  })

  it("renders repo name in the header", () => {
    mockUseQuery
      .mockReturnValueOnce({ data: { id: 1 }, isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RepositoryDetail />)
    expect(screen.getByText("api")).toBeInTheDocument()
  })

  it("renders Outlet (not repo content) when a child route is active", () => {
    mockUseChildMatches.mockReturnValue([{ routeId: "/_app/repositories/$owner/$repo/runs" }])
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RepositoryDetail />)
    expect(screen.getByTestId("outlet")).toBeInTheDocument()
    expect(screen.queryByTestId("page-spinner")).not.toBeInTheDocument()
    expect(screen.queryByText("Repository not found.")).not.toBeInTheDocument()
  })

  it("renders repo detail content (not Outlet) when no child route is active", () => {
    mockUseChildMatches.mockReturnValue([])
    mockUseQuery
      .mockReturnValueOnce({ data: { id: 1 }, isLoading: false } as ReturnType<typeof useQuery>)
      .mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    const { container } = render(<RepositoryDetail />)
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument()
    expect(container.querySelector(".health-repo-label-owner")).not.toBeNull()
  })
})

// ── RunnersCard ───────────────────────────────────────────────────────────────

describe("RunnersCard", () => {
  it("shows nothing while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.queryByText("No self-hosted runners configured.")).not.toBeInTheDocument()
  })

  it("shows empty state when runners data is undefined and not loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.getByText("No self-hosted runners configured.")).toBeInTheDocument()
  })

  it("shows empty state when runners array is empty", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.getByText("No self-hosted runners configured.")).toBeInTheDocument()
  })

  it("renders a row per runner", () => {
    mockUseQuery.mockReturnValue({ data: [makeRunner(), makeRunner({ name: "runner-2" })] } as ReturnType<typeof useQuery>)
    const { container } = render(<RunnersCard owner="acme" repo="api" />)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
  })

  it("shows runner name, OS, status, and labels", () => {
    mockUseQuery.mockReturnValue({
      data: [makeRunner({ name: "my-runner", os: "linux", status: "online", labels: ["self-hosted", "x64"] })],
    } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.getByText("my-runner")).toBeInTheDocument()
    expect(screen.getByText("linux")).toBeInTheDocument()
    expect(screen.getByText("online")).toBeInTheDocument()
    expect(screen.getByText("self-hosted, x64")).toBeInTheDocument()
  })

  it("shows 'busy' indicator when runner is busy", () => {
    mockUseQuery.mockReturnValue({
      data: [makeRunner({ status: "online", busy: true })],
    } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.getByText("online · busy")).toBeInTheDocument()
  })

  it("shows offline status for offline runner", () => {
    mockUseQuery.mockReturnValue({
      data: [makeRunner({ status: "offline", busy: false })],
    } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.getByText("offline")).toBeInTheDocument()
  })

  it("shows '—' in labels cell when runner has no labels", () => {
    mockUseQuery.mockReturnValue({
      data: [makeRunner({ labels: [] })],
    } as ReturnType<typeof useQuery>)
    render(<RunnersCard owner="acme" repo="api" />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })
})
