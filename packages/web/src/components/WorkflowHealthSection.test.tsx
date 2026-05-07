import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, params: _params, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))

// ResizeObserver is used by TruncatingTitle — stub globally (class, not arrow fn)
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = vi.fn() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

import { WorkflowHealthSection } from "./WorkflowHealthSection.js"
import type { WorkflowRun } from "../types/index.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0
function makeRun(overrides: Partial<WorkflowRun> & { workflowName: string }): WorkflowRun {
  return {
    id: ++_id,
    name: overrides.workflowName,
    status: "completed",
    conclusion: "success",
    headBranch: "main",
    headSha: "abc1234",
    runNumber: 1,
    event: "push",
    workflowId: ++_id,
    workflowPath: null,
    workflowName: overrides.workflowName,
    repository: "owner/repo",
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T10:05:00Z",
    runStartedAt: "2024-01-01T10:00:00Z",
    runAttempt: 1,
    url: "https://github.com",
    htmlUrl: "https://github.com",
    actor: null,
    displayTitle: overrides.workflowName,
    ...overrides,
  }
}

function makeRepoRuns(
  fullName: string,
  runs: WorkflowRun[]
): { name: string; fullName: string; runs: WorkflowRun[] } {
  return { name: fullName.split("/")[1]!, fullName, runs }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkflowHealthSection", () => {
  it("returns nothing when watchWorkflows is empty", () => {
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={[]} repoRuns={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("returns nothing when watchWorkflows is empty even with runs", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "publish" })])]
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={[]} repoRuns={repoRuns} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("returns nothing when no runs match the configured workflow names", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "ci" })])]
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["publish", "scan"]} repoRuns={repoRuns} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("returns nothing when repoRuns is empty", () => {
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders 'Workflow Health' as the section title", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "publish" })])]
    render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} repoRuns={repoRuns} />)
    expect(screen.getByText("Workflow Health")).toBeInTheDocument()
  })

  it("renders workflow names as a subtitle on a separate element", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "publish" })])]
    render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} repoRuns={repoRuns} />)
    expect(screen.getByText("publish, scan")).toBeInTheDocument()
  })

  it("title and subtitle are separate DOM elements", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "publish" })])]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} repoRuns={repoRuns} />)
    const title = container.querySelector(".card-title")
    const subtitle = container.querySelector(".card-header .text-muted.text-small")
    expect(title?.textContent).toBe("Workflow Health")
    expect(subtitle?.textContent).toBe("publish, scan")
  })

  it("card-header uses stretch alignment so the subtitle span is width-constrained", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "publish" })])]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    const header = container.querySelector(".card-header") as HTMLElement
    expect(header.style.alignItems).toBe("stretch")
  })

  it("renders owner and repo name inside the card", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "publish" })])]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    expect(screen.getByText("owner/")).toBeInTheDocument()
    expect(screen.getByText("repo")).toBeInTheDocument()
  })

  it("renders a run card for each matched workflow", () => {
    const repoRuns = [
      makeRepoRuns("owner/repo", [
        makeRun({ workflowName: "publish" }),
        makeRun({ workflowName: "scan" }),
      ]),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} repoRuns={repoRuns} />)
    expect(screen.getByText("publish")).toBeInTheDocument()
    expect(screen.getByText("scan")).toBeInTheDocument()
  })

  it("matching is case-insensitive", () => {
    const repoRuns = [makeRepoRuns("owner/repo", [makeRun({ workflowName: "Publish" })])]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    expect(screen.getByText("Publish")).toBeInTheDocument()
  })

  it("excludes repos that have no matching workflows", () => {
    const repoRuns = [
      makeRepoRuns("owner/repo-a", [makeRun({ workflowName: "publish" })]),
      makeRepoRuns("owner/repo-b", [makeRun({ workflowName: "ci" })]),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    expect(screen.getByText("repo-a")).toBeInTheDocument()
    expect(screen.queryByText("repo-b")).not.toBeInTheDocument()
  })

  it("shows a card for each matching repo in a single flat grid", () => {
    const repoRuns = [
      makeRepoRuns("owner/repo-a", [makeRun({ workflowName: "publish" })]),
      makeRepoRuns("owner/repo-b", [makeRun({ workflowName: "publish" })]),
    ]
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />
    )
    expect(screen.getByText("repo-a")).toBeInTheDocument()
    expect(screen.getByText("repo-b")).toBeInTheDocument()
    // Both cards in a single grid — no nested sub-grids
    expect(container.querySelectorAll(".latest-runs-grid")).toHaveLength(1)
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(2)
  })

  it("prefers in-progress run over completed when both exist", () => {
    const completed = makeRun({ workflowName: "publish", status: "completed", conclusion: "success" })
    const inProgress = makeRun({ workflowName: "publish", status: "in_progress", conclusion: null })
    const repoRuns = [makeRepoRuns("owner/repo", [completed, inProgress])]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    // in_progress run should have the pulse dot
    const dots = document.querySelectorAll(".run-dot-pulse")
    expect(dots.length).toBeGreaterThan(0)
  })

  it("only shows one card per workflow name per repo", () => {
    // Two runs with the same workflow name — only one card should appear
    const run1 = makeRun({ workflowName: "publish" })
    const run2 = makeRun({ workflowName: "publish" })
    const repoRuns = [makeRepoRuns("owner/repo", [run1, run2])]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(1)
  })

  it("does not render non-matching workflow runs", () => {
    const repoRuns = [
      makeRepoRuns("owner/repo", [
        makeRun({ workflowName: "publish" }),
        makeRun({ workflowName: "ci" }),
      ]),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} repoRuns={repoRuns} />)
    expect(screen.queryByText("ci")).not.toBeInTheDocument()
  })
})
