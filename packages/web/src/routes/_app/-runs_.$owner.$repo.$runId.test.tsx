import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { WorkflowRun, WorkflowJob } from "../../types/index.js"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => ({
    ...opts,
    useParams: vi.fn(() => ({ owner: "acme", repo: "api", runId: "42" })),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, params: _p, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}))

vi.mock("../../api/index.js", () => ({
  getRun: vi.fn(),
  getRunJobs: vi.fn(),
  getRuns: vi.fn(),
  getRunArtifacts: vi.fn(),
  getJobLogs: vi.fn(),
  rerunWorkflow: vi.fn(),
  rerunFailedJobs: vi.fn(),
  cancelRun: vi.fn(),
}))

vi.mock("../../components/ui/Spinner.js", () => ({
  PageSpinner: () => <div data-testid="page-spinner" />,
  Spinner: () => <span data-testid="spinner" />,
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

vi.mock("../../lib/utils.js", () => ({
  formatRelativeTime: (s: string | null) => (s ? "2 hours ago" : "—"),
  formatDuration: (_a: string | null, _b: string | null) => "1m 30s",
  formatDateTime: (s: string | null) => (s ? "2024-01-01 10:00" : "—"),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Route, triggerDescription, RunSummaryBar, JobsCard } from "./runs_.$owner.$repo.$runId.js"

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
    headSha: "aabbccddee112233",
    runNumber: _id,
    event: "push",
    workflowId: 10,
    workflowPath: ".github/workflows/ci.yml",
    workflowName: "CI Workflow",
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

function makeJob(overrides: Partial<WorkflowJob> = {}): WorkflowJob {
  return {
    id: ++_id,
    name: "build",
    status: "completed",
    conclusion: "success",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: "2024-01-01T10:01:30Z",
    steps: [
      { name: "Checkout", status: "completed", conclusion: "success", number: 1, startedAt: null, completedAt: null },
    ],
    runnerName: "ubuntu-latest",
    labels: [],
    htmlUrl: "https://github.com/owner/repo/actions/runs/1/jobs/1",
    ...overrides,
  }
}

// ── triggerDescription ────────────────────────────────────────────────────────

describe("triggerDescription", () => {
  it("push with actor → 'Pushed by login'", () => {
    const run = makeRun({ event: "push", actor: { login: "jan", avatarUrl: "" } })
    expect(triggerDescription(run)).toBe("Pushed by jan")
  })

  it("push without actor → 'Pushed'", () => {
    expect(triggerDescription(makeRun({ event: "push", actor: null }))).toBe("Pushed")
  })

  it("workflow_dispatch with actor → 'Manually triggered by login'", () => {
    const run = makeRun({ event: "workflow_dispatch", actor: { login: "alice", avatarUrl: "" } })
    expect(triggerDescription(run)).toBe("Manually triggered by alice")
  })

  it("workflow_dispatch without actor → 'Manually triggered'", () => {
    expect(triggerDescription(makeRun({ event: "workflow_dispatch", actor: null }))).toBe("Manually triggered")
  })

  it("schedule → 'Scheduled run'", () => {
    expect(triggerDescription(makeRun({ event: "schedule" }))).toBe("Scheduled run")
  })

  it("pull_request with actor → 'Pull request by login'", () => {
    const run = makeRun({ event: "pull_request", actor: { login: "bob", avatarUrl: "" } })
    expect(triggerDescription(run)).toBe("Pull request by bob")
  })

  it("pull_request_target without actor → 'Pull request'", () => {
    expect(triggerDescription(makeRun({ event: "pull_request_target", actor: null }))).toBe("Pull request")
  })

  it("unknown event → returns the event string", () => {
    expect(triggerDescription(makeRun({ event: "deployment" }))).toBe("deployment")
  })
})

// ── RunSummaryBar ─────────────────────────────────────────────────────────────

describe("RunSummaryBar", () => {
  it("shows trigger description", () => {
    const run = makeRun({ event: "push", actor: { login: "jan", avatarUrl: "" } })
    render(<RunSummaryBar run={run} owner="acme" repo="api" />)
    expect(screen.getByText("Pushed by jan")).toBeInTheDocument()
  })

  it("shows relative time", () => {
    render(<RunSummaryBar run={makeRun()} owner="acme" repo="api" />)
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument()
  })

  it("shows actor login prefixed with @", () => {
    const run = makeRun({ actor: { login: "jan", avatarUrl: "https://example.com/avatar.png" } })
    render(<RunSummaryBar run={run} owner="acme" repo="api" />)
    expect(screen.getByText("@jan")).toBeInTheDocument()
  })

  it("shows no actor chip when actor is null", () => {
    render(<RunSummaryBar run={makeRun({ actor: null })} owner="acme" repo="api" />)
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it("commit link shows truncated sha and links to GitHub", () => {
    const run = makeRun({ headSha: "aabbccddee112233" })
    render(<RunSummaryBar run={run} owner="acme" repo="api" />)
    const link = screen.getByRole("link", { name: "aabbccd" })
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/commit/aabbccddee112233")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("branch link links to GitHub branch", () => {
    const run = makeRun({ headBranch: "feature/x" })
    render(<RunSummaryBar run={run} owner="acme" repo="api" />)
    const link = screen.getByRole("link", { name: "feature/x" })
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/tree/feature/x")
  })

  it("renders a StatusBadge", () => {
    render(<RunSummaryBar run={makeRun()} owner="acme" repo="api" />)
    expect(screen.getByTestId("status-badge")).toBeInTheDocument()
  })

  it("shows Duration and Artifacts labels", () => {
    render(<RunSummaryBar run={makeRun()} owner="acme" repo="api" />)
    expect(screen.getByText("Duration")).toBeInTheDocument()
    expect(screen.getByText("Artifacts")).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows attempt chip when runAttempt > 1", () => {
    render(<RunSummaryBar run={makeRun({ runAttempt: 3 })} owner="acme" repo="api" />)
    expect(screen.getByText("Attempt #3")).toBeInTheDocument()
  })

  it("does not show attempt chip when runAttempt is 1", () => {
    render(<RunSummaryBar run={makeRun({ runAttempt: 1 })} owner="acme" repo="api" />)
    expect(screen.queryByText(/Attempt/)).not.toBeInTheDocument()
  })
})

// ── JobsCard ──────────────────────────────────────────────────────────────────

describe("JobsCard", () => {
  it("shows spinner when jobs is undefined", () => {
    render(<JobsCard jobs={undefined} />)
    expect(screen.getByTestId("page-spinner")).toBeInTheDocument()
  })

  it("shows empty state when jobs array is empty", () => {
    render(<JobsCard jobs={[]} />)
    expect(screen.getByText("No jobs found.")).toBeInTheDocument()
  })

  it("renders one row per job", () => {
    const { container } = render(<JobsCard jobs={[makeJob(), makeJob()]} />)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
  })

  it("shows job name", () => {
    render(<JobsCard jobs={[makeJob({ name: "lint" })]} />)
    expect(screen.getByText("lint")).toBeInTheDocument()
  })

  it("renders a StatusBadge per job", () => {
    render(<JobsCard jobs={[makeJob(), makeJob()]} />)
    expect(screen.getAllByTestId("status-badge")).toHaveLength(2)
  })

  it("shows step count as passed/total", () => {
    const job = makeJob({
      steps: [
        { name: "A", status: "completed", conclusion: "success", number: 1, startedAt: null, completedAt: null },
        { name: "B", status: "completed", conclusion: "failure", number: 2, startedAt: null, completedAt: null },
      ],
    })
    render(<JobsCard jobs={[job]} />)
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
  })

  it("shows runner name", () => {
    render(<JobsCard jobs={[makeJob({ runnerName: "ubuntu-22.04" })]} />)
    expect(screen.getByText("ubuntu-22.04")).toBeInTheDocument()
  })

  it("shows '—' when runner is null and labels are empty", () => {
    render(<JobsCard jobs={[makeJob({ runnerName: null, labels: [] })]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows labels when runnerName is null", () => {
    render(<JobsCard jobs={[makeJob({ runnerName: null, labels: ["ubuntu-latest"] })]} />)
    expect(screen.getByText("ubuntu-latest")).toBeInTheDocument()
    expect(screen.queryByText("—")).not.toBeInTheDocument()
  })

  it("shows runnerName and labels together", () => {
    render(<JobsCard jobs={[makeJob({ runnerName: "runner-1", labels: ["self-hosted", "linux"] })]} />)
    expect(screen.getByText("runner-1")).toBeInTheDocument()
    expect(screen.getByText("(self-hosted, linux)")).toBeInTheDocument()
  })

  it("shows job count in card header", () => {
    render(<JobsCard jobs={[makeJob(), makeJob(), makeJob()]} />)
    expect(screen.getByTestId("card-header")).toHaveTextContent("Jobs (3)")
  })

  it("renders all column headers", () => {
    render(<JobsCard jobs={[makeJob()]} />)
    expect(screen.getByText("Job")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getByText("Steps")).toBeInTheDocument()
    expect(screen.getByText("Duration")).toBeInTheDocument()
    expect(screen.getByText("Runner")).toBeInTheDocument()
  })
})

// ── JobsCard expansion ────────────────────────────────────────────────────────

describe("JobsCard expansion", () => {
  it("clicking a job row shows the expansion panel with steps", () => {
    const job = makeJob({ name: "build", steps: [
      { name: "Checkout", status: "completed", conclusion: "success", number: 1, startedAt: null, completedAt: null },
      { name: "Run tests", status: "completed", conclusion: "success", number: 2, startedAt: null, completedAt: null },
    ] })
    render(<JobsCard jobs={[job]} />)
    expect(screen.queryByText("Checkout")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("build"))
    expect(screen.getByText("Checkout")).toBeInTheDocument()
    expect(screen.getByText("Run tests")).toBeInTheDocument()
  })

  it("clicking an expanded row collapses it again", () => {
    render(<JobsCard jobs={[makeJob({ name: "build" })]} />)
    fireEvent.click(screen.getByText("build"))
    expect(screen.getByText("Checkout")).toBeInTheDocument()
    fireEvent.click(screen.getByText("build"))
    expect(screen.queryByText("Checkout")).not.toBeInTheDocument()
  })

  it("chevron gains open class on expand and loses it on collapse", () => {
    const { container } = render(<JobsCard jobs={[makeJob()]} />)
    const chevron = container.querySelector(".job-chevron")!
    expect(chevron.classList.contains("job-chevron-open")).toBe(false)
    fireEvent.click(screen.getByText("build"))
    expect(chevron.classList.contains("job-chevron-open")).toBe(true)
    fireEvent.click(screen.getByText("build"))
    expect(chevron.classList.contains("job-chevron-open")).toBe(false)
  })

  it("multiple rows can be expanded independently", () => {
    const jobs = [
      makeJob({ name: "lint", steps: [{ name: "ESLint", status: "completed", conclusion: "success", number: 1, startedAt: null, completedAt: null }] }),
      makeJob({ name: "test", steps: [{ name: "Jest", status: "completed", conclusion: "success", number: 1, startedAt: null, completedAt: null }] }),
    ]
    render(<JobsCard jobs={jobs} />)
    fireEvent.click(screen.getByText("lint"))
    expect(screen.getByText("ESLint")).toBeInTheDocument()
    expect(screen.queryByText("Jest")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("test"))
    expect(screen.getByText("ESLint")).toBeInTheDocument()
    expect(screen.getByText("Jest")).toBeInTheDocument()
  })

  it("does not show log preview for a successful completed job", () => {
    render(<JobsCard jobs={[makeJob({ conclusion: "success" })]} runCompleted />)
    fireEvent.click(screen.getByText("build"))
    expect(screen.queryByText(/Log preview/)).not.toBeInTheDocument()
  })

  it("shows log preview header for a failed completed job", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true, isError: false } as never)
    const failedJob = makeJob({ conclusion: "failure", status: "completed" })
    render(<JobsCard jobs={[failedJob]} runCompleted />)
    fireEvent.click(screen.getByText("build"))
    expect(screen.getByText("Log preview (last 30 lines)")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /View full logs on GitHub/ })).toBeInTheDocument()
  })

  it("shows log tail content when log data is available", () => {
    const logText = "2024-01-01T10:00:00.000Z Step output line 1\n2024-01-01T10:00:01.000Z Step output line 2\n"
    vi.mocked(useQuery).mockReturnValue({ data: logText, isLoading: false, isError: false } as never)
    const failedJob = makeJob({ conclusion: "failure", status: "completed" })
    render(<JobsCard jobs={[failedJob]} runCompleted />)
    fireEvent.click(screen.getByText("build"))
    expect(screen.getByText(/Step output line 1/)).toBeInTheDocument()
  })

  it("shows error message when logs are unavailable", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: false, isError: true } as never)
    const failedJob = makeJob({ conclusion: "failure", status: "completed" })
    render(<JobsCard jobs={[failedJob]} runCompleted />)
    fireEvent.click(screen.getByText("build"))
    expect(screen.getByText("Logs unavailable.")).toBeInTheDocument()
  })

  it("does not show log preview when run is not completed", () => {
    const failedJob = makeJob({ conclusion: "failure", status: "completed" })
    render(<JobsCard jobs={[failedJob]} runCompleted={false} />)
    fireEvent.click(screen.getByText("build"))
    expect(screen.queryByText(/Log preview/)).not.toBeInTheDocument()
  })
})

// ── RunDetail page — workflow name link ───────────────────────────────────────

describe("RunDetail page — workflow name link", () => {
  beforeEach(() => {
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: vi.fn() } as never)
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  })

  it("workflow name is a link to the GitHub Actions workflow page", () => {
    const run = makeRun({ workflowPath: ".github/workflows/my-workflow.yml", workflowName: "My Workflow" })
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: run, isLoading: false } as never)   // getRun
      .mockReturnValueOnce({ data: [], isLoading: false } as never)    // getRunJobs
      .mockReturnValueOnce({ data: [], isLoading: false } as never)    // getRunArtifacts
      .mockReturnValueOnce({ data: { runs: [] }, isLoading: false } as never) // branch history

    const RunDetail = Route.component as React.FC
    render(<RunDetail />)

    const link = screen.getByRole("link", { name: "My Workflow" })
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/actions/workflows/my-workflow.yml")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("workflow name renders as plain text when workflowPath is null", () => {
    const run = makeRun({ workflowPath: null, workflowName: "My Workflow" })
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: run, isLoading: false } as never)   // getRun
      .mockReturnValueOnce({ data: [], isLoading: false } as never)    // getRunJobs
      .mockReturnValueOnce({ data: [], isLoading: false } as never)    // getRunArtifacts
      .mockReturnValueOnce({ data: { runs: [] }, isLoading: false } as never) // branch history

    const RunDetail = Route.component as React.FC
    render(<RunDetail />)

    expect(screen.getByText("My Workflow")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "My Workflow" })).toBeNull()
  })
})
