import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import type { Repository, WorkflowRun } from "../../types/index.js"

// ── Mocks (must precede imports of the module under test) ────────────────────

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, params: _params, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueries: vi.fn(),
}))

vi.mock("../../api/index.js", () => ({
  getRepos: vi.fn(),
  getRuns: vi.fn(),
}))

vi.mock("../../components/charts/RunCharts.js", () => ({
  RepoActivityChart: () => <div data-testid="activity-chart" />,
  BuildTrendChart: () => <div data-testid="trend-chart" />,
}))

vi.mock("../../components/ui/SuccessSquares.js", () => ({
  SuccessSquares: () => <span data-testid="success-squares" />,
}))

vi.mock("../../components/ui/Spinner.js", () => ({
  PageSpinner: () => <div data-testid="page-spinner" />,
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import React from "react"
import {
  pickDisplayRun,
  groupByWorkflow,
  formatSeconds,
  RepoRunCards,
  ActivityCard,
  HealthTable,
  BuildTrendsCard,
} from "./index.js"
import { VARIANT_COLOR } from "../../lib/utils.js"

// ── Test helpers ──────────────────────────────────────────────────────────────

let _runId = 0
let _repoId = 0
beforeEach(() => { _runId = 0; _repoId = 0 })

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: ++_runId,
    name: "CI",
    status: "completed",
    conclusion: "success",
    headBranch: "main",
    headSha: "abc1234def5678",
    runNumber: 1,
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
    displayTitle: "CI run",
    ...overrides,
  }
}

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  const id = ++_repoId
  return {
    id,
    name: `repo-${id}`,
    fullName: `owner/repo-${id}`,
    owner: "owner",
    private: false,
    description: null,
    defaultBranch: "main",
    pushedAt: null,
    updatedAt: "2024-01-01T00:00:00Z",
    language: null,
    stargazersCount: 0,
    openIssuesCount: 0,
    htmlUrl: `https://github.com/owner/repo-${id}`,
    topics: [],
    visibility: "public",
    ...overrides,
  }
}

// ── pickDisplayRun ────────────────────────────────────────────────────────────

describe("pickDisplayRun", () => {
  it("returns in_progress run over completed", () => {
    const runs = [
      makeRun({ status: "completed", conclusion: "success" }),
      makeRun({ status: "in_progress", conclusion: null }),
    ]
    expect(pickDisplayRun(runs)?.status).toBe("in_progress")
  })

  it("returns queued run when no in_progress run exists", () => {
    const runs = [
      makeRun({ status: "completed", conclusion: "success" }),
      makeRun({ status: "queued", conclusion: null }),
    ]
    expect(pickDisplayRun(runs)?.status).toBe("queued")
  })

  it("falls back to the first run when none are active", () => {
    const run = makeRun({ id: 99, status: "completed", conclusion: "failure" })
    expect(pickDisplayRun([run])?.id).toBe(99)
  })

  it("returns undefined for an empty array", () => {
    expect(pickDisplayRun([])).toBeUndefined()
  })
})

// ── groupByWorkflow ───────────────────────────────────────────────────────────

describe("groupByWorkflow", () => {
  it("groups runs by workflowId", () => {
    const runs = [
      makeRun({ workflowId: 1, workflowName: "Build" }),
      makeRun({ workflowId: 2, workflowName: "Deploy" }),
      makeRun({ workflowId: 1, workflowName: "Build" }),
    ]
    expect(groupByWorkflow(runs)).toHaveLength(2)
  })

  it("uses workflowName for the group label", () => {
    const runs = [makeRun({ workflowId: 5, workflowName: "Release" })]
    const [group] = groupByWorkflow(runs)
    expect(group.name).toBe("Release")
  })

  it("sorts groups by most recent run, newest first", () => {
    const runs = [
      makeRun({ workflowId: 1, workflowName: "Build",  createdAt: "2024-01-01T00:00:00Z" }),
      makeRun({ workflowId: 2, workflowName: "Deploy", createdAt: "2024-01-10T00:00:00Z" }),
    ]
    const groups = groupByWorkflow(runs)
    expect(groups[0].name).toBe("Deploy")
    expect(groups[1].name).toBe("Build")
  })

  it("includes all runs within a group", () => {
    const runs = [
      makeRun({ workflowId: 1 }),
      makeRun({ workflowId: 1 }),
      makeRun({ workflowId: 1 }),
    ]
    const [group] = groupByWorkflow(runs)
    expect(group.runs).toHaveLength(3)
  })
})

// ── formatSeconds ─────────────────────────────────────────────────────────────

describe("formatSeconds", () => {
  it.each([
    [0,    "0s"],
    [45,   "45s"],
    [59,   "59s"],
    [60,   "1m"],
    [90,   "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [3660, "1h 1m"],
    [7200, "2h"],
    [7320, "2h 2m"],
  ])("%is → %s", (input, expected) => {
    expect(formatSeconds(input)).toBe(expected)
  })
})

// ── RepoRunCards ──────────────────────────────────────────────────────────────

describe("RepoRunCards", () => {
  it("renders nothing when runs is empty", () => {
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders one card per unique workflowId", () => {
    const runs = [
      makeRun({ workflowId: 1, workflowName: "Build" }),
      makeRun({ workflowId: 2, workflowName: "Deploy" }),
      makeRun({ workflowId: 1, workflowName: "Build" }), // duplicate
    ]
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={runs} />)
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(2)
  })

  it("marks a card data-active when the display run is in_progress", () => {
    const runs = [
      makeRun({ workflowId: 1, status: "completed",  conclusion: "success" }),
      makeRun({ workflowId: 1, status: "in_progress", conclusion: null }),
    ]
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={runs} />)
    const card = container.querySelector(".latest-run-card")
    expect(card).toHaveAttribute("data-active")
  })

  it("does not mark a card data-active for a completed run", () => {
    const runs = [makeRun({ workflowId: 1, status: "completed", conclusion: "success" })]
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={runs} />)
    const card = container.querySelector(".latest-run-card")
    expect(card).not.toHaveAttribute("data-active")
  })

  it("shows branch and truncated sha", () => {
    const runs = [makeRun({ headBranch: "develop", headSha: "aabbccddee1122" })]
    render(<RepoRunCards fullName="owner/repo" runs={runs} />)
    expect(screen.getByText("develop")).toBeInTheDocument()
    expect(screen.getByText("aabbccd")).toBeInTheDocument()
  })

  it("card root element is a div, not an anchor", () => {
    const runs = [makeRun({ workflowId: 1, workflowName: "Build" })]
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={runs} />)
    const card = container.querySelector(".latest-run-card")!
    expect(card.tagName).toBe("DIV")
  })

  it("workflow name is a link pointing to the run detail page", () => {
    const run = makeRun({ workflowId: 1, workflowName: "Deploy" })
    render(<RepoRunCards fullName="acme/api" runs={[run]} />)
    const link = screen.getByRole("link", { name: "Deploy" })
    expect(link).toHaveAttribute("href", "/runs/$owner/$repo/$runId")
  })

  it("no anchor is nested inside another anchor", () => {
    const run = makeRun({ headBranch: "main", headSha: "aabbccddee112233" })
    const { container } = render(<RepoRunCards fullName="acme/api" runs={[run]} />)
    const allAnchors = Array.from(container.querySelectorAll("a"))
    for (const anchor of allAnchors) {
      expect(anchor.closest("a:not(:scope)")).toBeNull()
    }
  })

  it("branch link points to GitHub branch URL", () => {
    const run = makeRun({ headBranch: "feature/x" })
    render(<RepoRunCards fullName="acme/api" runs={[run]} />)
    const link = screen.getByRole("link", { name: /feature\/x/ })
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/tree/feature/x")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("commit link points to GitHub commit URL", () => {
    const run = makeRun({ headSha: "aabbccddee112233" })
    render(<RepoRunCards fullName="acme/api" runs={[run]} />)
    const link = screen.getByRole("link", { name: /aabbccd/ })
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/commit/aabbccddee112233")
  })

  // ── Colored left border ─────────────────────────────────────────────────────

  it("success run card has a green left border", () => {
    const run = makeRun({ status: "completed", conclusion: "success" })
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={[run]} />)
    const card = container.querySelector(".latest-run-card") as HTMLElement
    expect(card.style.borderLeft).toContain(VARIANT_COLOR.success)
  })

  it("failure run card has a red left border", () => {
    const run = makeRun({ status: "completed", conclusion: "failure" })
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={[run]} />)
    const card = container.querySelector(".latest-run-card") as HTMLElement
    expect(card.style.borderLeft).toContain(VARIANT_COLOR.failure)
  })

  it("in_progress run card has a running-color left border", () => {
    const run = makeRun({ status: "in_progress", conclusion: null })
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={[run]} />)
    const card = container.querySelector(".latest-run-card") as HTMLElement
    expect(card.style.borderLeft).toContain(VARIANT_COLOR.running)
  })

  it("cancelled run card has a cancelled-color left border", () => {
    const run = makeRun({ status: "completed", conclusion: "cancelled" })
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={[run]} />)
    const card = container.querySelector(".latest-run-card") as HTMLElement
    expect(card.style.borderLeft).toContain(VARIANT_COLOR.cancelled)
  })

  it("each card gets its own status-appropriate border color", () => {
    const runs = [
      makeRun({ workflowId: 1, status: "completed", conclusion: "success" }),
      makeRun({ workflowId: 2, status: "completed", conclusion: "failure" }),
    ]
    const { container } = render(<RepoRunCards fullName="owner/repo" runs={runs} />)
    const cards = container.querySelectorAll(".latest-run-card") as NodeListOf<HTMLElement>
    const borders = Array.from(cards).map((c) => c.style.borderLeft)
    expect(borders[0]).toContain(VARIANT_COLOR.success)
    expect(borders[1]).toContain(VARIANT_COLOR.failure)
  })
})

// ── ActivityCard ──────────────────────────────────────────────────────────────

describe("ActivityCard", () => {
  it("renders all stat labels", () => {
    const repos = [makeRepo()]
    const repoRuns = [{ name: "repo-1", fullName: "owner/repo-1", runs: [makeRun()] }]
    render(<ActivityCard repoRuns={repoRuns} repos={repos} />)
    expect(screen.getByText("workflows")).toBeInTheDocument()
    expect(screen.getByText("runs")).toBeInTheDocument()
    expect(screen.getByText("succeeded")).toBeInTheDocument()
    expect(screen.getByText("failed")).toBeInTheDocument()
    expect(screen.getByText("canceled")).toBeInTheDocument()
    expect(screen.getByText("total duration")).toBeInTheDocument()
  })

  it("counts unique workflows across all repos", () => {
    const repos = [makeRepo(), makeRepo()]
    const repoRuns = [
      { name: "repo-1", fullName: "owner/repo-1", runs: [makeRun({ workflowId: 1 }), makeRun({ workflowId: 2 })] },
      { name: "repo-2", fullName: "owner/repo-2", runs: [makeRun({ workflowId: 3 })] },
    ]
    render(<ActivityCard repoRuns={repoRuns} repos={repos} />)
    const wfStat = screen.getByText("workflows").closest(".activity-stat")
    expect(wfStat?.querySelector(".activity-stat-value")?.textContent).toBe("3")
  })

  it("counts failed runs (failure + timed_out)", () => {
    const repos = [makeRepo()]
    const repoRuns = [{
      name: "repo-1", fullName: "owner/repo-1", runs: [
        makeRun({ conclusion: "failure" }),
        makeRun({ conclusion: "timed_out" }),
        makeRun({ conclusion: "success" }),
      ],
    }]
    render(<ActivityCard repoRuns={repoRuns} repos={repos} />)
    const failedStat = screen.getByText("failed").closest(".activity-stat")
    expect(failedStat?.querySelector(".activity-stat-value")?.textContent).toBe("2")
  })

  it("counts succeeded and cancelled runs separately", () => {
    const repos = [makeRepo()]
    const repoRuns = [{
      name: "repo-1", fullName: "owner/repo-1", runs: [
        makeRun({ conclusion: "success" }),
        makeRun({ conclusion: "success" }),
        makeRun({ conclusion: "cancelled" }),
      ],
    }]
    render(<ActivityCard repoRuns={repoRuns} repos={repos} />)
    const succeededStat = screen.getByText("succeeded").closest(".activity-stat")
    expect(succeededStat?.querySelector(".activity-stat-value")?.textContent).toBe("2")
    const canceledStat = screen.getByText("canceled").closest(".activity-stat")
    expect(canceledStat?.querySelector(".activity-stat-value")?.textContent).toBe("1")
  })

  it("shows subtitle with count of active repositories", () => {
    const repos = [makeRepo(), makeRepo()]
    const repoRuns = [
      { name: "repo-1", fullName: "owner/repo-1", runs: [makeRun()] },
      { name: "repo-2", fullName: "owner/repo-2", runs: [] },
    ]
    render(<ActivityCard repoRuns={repoRuns} repos={repos} />)
    expect(screen.getByText(/1 of 2 repositories active/)).toBeInTheDocument()
  })

  it("hides subtitle when no repositories are active", () => {
    const repos = [makeRepo()]
    const repoRuns = [{ name: "repo-1", fullName: "owner/repo-1", runs: [] }]
    render(<ActivityCard repoRuns={repoRuns} repos={repos} />)
    expect(screen.queryByText(/active/)).not.toBeInTheDocument()
  })
})

// ── HealthTable ───────────────────────────────────────────────────────────────

describe("HealthTable", () => {
  it("shows empty state when there are no repos", () => {
    render(<HealthTable repoRuns={[]} repos={[]} />)
    expect(screen.getByText("No repositories found.")).toBeInTheDocument()
  })

  it("sorts repos by most recent run, newest first", () => {
    const repo1 = makeRepo({ name: "older", fullName: "owner/older" })
    const repo2 = makeRepo({ name: "newer", fullName: "owner/newer" })
    const repoRuns = [
      { name: "older", fullName: "owner/older", runs: [makeRun({ createdAt: "2024-01-01T00:00:00Z" })] },
      { name: "newer", fullName: "owner/newer", runs: [makeRun({ createdAt: "2024-01-10T00:00:00Z" })] },
    ]
    // Pass in "wrong" order — older first, newer second
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo1, repo2]} />)
    const labels = container.querySelectorAll(".health-repo-label")
    expect(labels[0].textContent).toContain("newer")
    expect(labels[1].textContent).toContain("older")
  })

  it("repos with no runs sort after repos with runs", () => {
    // repos passed in "wrong" order (inactive first); repoRuns must be index-aligned
    const repoWithoutRuns = makeRepo({ fullName: "owner/inactive" })
    const repoWithRuns    = makeRepo({ fullName: "owner/active" })
    const repoRuns = [
      { name: "inactive", fullName: "owner/inactive", runs: [] },
      { name: "active",   fullName: "owner/active",   runs: [makeRun({ createdAt: "2024-01-05T00:00:00Z" })] },
    ]
    const { container } = render(
      <HealthTable repoRuns={repoRuns} repos={[repoWithoutRuns, repoWithRuns]} />
    )
    const labels = container.querySelectorAll(".health-repo-label")
    expect(labels[0].textContent).toContain("active")
    expect(labels[1].textContent).toContain("inactive")
  })

  it("renders run cards for repos that have runs", () => {
    const repo = makeRepo({ fullName: "owner/repo-1" })
    const repoRuns = [
      { name: "repo-1", fullName: "owner/repo-1", runs: [makeRun({ workflowId: 1 })] },
    ]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(1)
  })

  it("does not render run cards for repos without runs", () => {
    const repo = makeRepo({ fullName: "owner/repo-1" })
    const repoRuns = [{ name: "repo-1", fullName: "owner/repo-1", runs: [] }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(0)
  })

  it("expands the top 3 repos with most recent runs by default", () => {
    const repos = Array.from({ length: 4 }, (_, i) =>
      makeRepo({ fullName: `owner/repo-${i + 1}` })
    )
    const repoRuns = repos.map((r, i) => ({
      name: r.name,
      fullName: r.fullName,
      runs: [makeRun({
        workflowId: i + 1,
        workflowName: `Workflow-${i + 1}`,
        createdAt: `2024-01-0${i + 1}T00:00:00Z`,
      })],
    }))
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={repos} />)
    // 3 repos expanded → 3 workflow sub-rows visible
    expect(container.querySelectorAll(".health-workflow-row")).toHaveLength(3)
  })

  it("collapses a repo when its row is clicked", () => {
    const repo = makeRepo({ fullName: "owner/repo-1" })
    const repoRuns = [{
      name: "repo-1", fullName: "owner/repo-1",
      runs: [makeRun({ workflowId: 1, workflowName: "Build" })],
    }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    // Starts expanded (only repo, so in top 3)
    expect(container.querySelectorAll(".health-workflow-row")).toHaveLength(1)
    fireEvent.click(container.querySelector(".health-repo-row")!)
    expect(container.querySelectorAll(".health-workflow-row")).toHaveLength(0)
  })

  it("re-expands a repo when its row is clicked again", () => {
    const repo = makeRepo({ fullName: "owner/repo-1" })
    const repoRuns = [{
      name: "repo-1", fullName: "owner/repo-1",
      runs: [makeRun({ workflowId: 1 })],
    }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    const repoRow = container.querySelector(".health-repo-row")!
    fireEvent.click(repoRow) // collapse
    fireEvent.click(repoRow) // expand again
    expect(container.querySelectorAll(".health-workflow-row")).toHaveLength(1)
  })

  it("shows 'N more workflows' button when a repo has more than 10 workflows", () => {
    const repo = makeRepo({ fullName: "owner/repo-1" })
    const runs = Array.from({ length: 12 }, (_, i) =>
      makeRun({ workflowId: i + 1, workflowName: `Workflow-${i + 1}` })
    )
    const repoRuns = [{ name: "repo-1", fullName: "owner/repo-1", runs }]
    render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    expect(screen.getByText(/2 more workflow/)).toBeInTheDocument()
  })

  it("reveals all workflows after clicking 'show more'", () => {
    const repo = makeRepo({ fullName: "owner/repo-1" })
    const runs = Array.from({ length: 12 }, (_, i) =>
      makeRun({ workflowId: i + 1, workflowName: `Workflow-${i + 1}` })
    )
    const repoRuns = [{ name: "repo-1", fullName: "owner/repo-1", runs }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    fireEvent.click(screen.getByText(/2 more workflow/))
    // All 12 workflows visible now
    expect(container.querySelectorAll(".health-workflow-row")).toHaveLength(12)
  })

  it("workflow name links to the last run detail page for that workflow", () => {
    const repo = makeRepo({ fullName: "acme/api" })
    const lastRun = makeRun({ id: 99, workflowId: 5, workflowName: "Deploy" })
    const olderRun = makeRun({ id: 55, workflowId: 5, workflowName: "Deploy", createdAt: "2023-01-01T00:00:00Z" })
    const repoRuns = [{ name: "api", fullName: "acme/api", runs: [lastRun, olderRun] }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    // Scope to the workflow sub-row (not the run card in the grid above)
    const wfRow = container.querySelector(".health-workflow-row")!
    const link = within(wfRow).getByRole("link", { name: "Deploy" })
    expect(link).toHaveAttribute("href", "/runs/$owner/$repo/$runId")
  })

  it("workflow link uses the most recent run (runs[0]) as the target", () => {
    const repo = makeRepo({ fullName: "acme/api" })
    const newerRun = makeRun({ id: 200, workflowId: 7, workflowName: "CI", createdAt: "2024-06-01T00:00:00Z" })
    const olderRun = makeRun({ id: 100, workflowId: 7, workflowName: "CI", createdAt: "2024-01-01T00:00:00Z" })
    const repoRuns = [{ name: "api", fullName: "acme/api", runs: [newerRun, olderRun] }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    const wfRow = container.querySelector(".health-workflow-row")!
    const link = within(wfRow).getByRole("link")
    expect(link).not.toHaveAttribute("href", "/repositories/$owner/$repo/runs")
    expect(link).toHaveAttribute("href", "/runs/$owner/$repo/$runId")
  })

  // ── Truncation and layout ───────────────────────────────────────────────────

  it("wraps workflow name in health-workflow-name-cell for truncation", () => {
    const repo = makeRepo({ fullName: "owner/repo" })
    const repoRuns = [{
      name: "repo", fullName: "owner/repo",
      runs: [makeRun({ workflowId: 1, workflowName: "npm_and_yarn in /microservices for @xmldom/xmldom - Update #1334106698" })],
    }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    const wfRow = container.querySelector(".health-workflow-row")!
    expect(wfRow.querySelector(".health-workflow-name-cell")).toBeInTheDocument()
  })

  it("workflow name link inside name-cell has truncate class", () => {
    const repo = makeRepo({ fullName: "owner/repo" })
    const repoRuns = [{
      name: "repo", fullName: "owner/repo",
      runs: [makeRun({ workflowId: 1, workflowName: "A Very Long Workflow Name That Should Be Truncated" })],
    }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    const wfRow = container.querySelector(".health-workflow-row")!
    const nameCell = wfRow.querySelector(".health-workflow-name-cell")!
    const link = nameCell.querySelector("a")
    expect(link?.classList.contains("truncate")).toBe(true)
  })

  it("workflow last-run cell has health-last-run class for no-wrap", () => {
    const repo = makeRepo({ fullName: "owner/repo" })
    const repoRuns = [{
      name: "repo", fullName: "owner/repo",
      runs: [makeRun({ workflowId: 1, workflowName: "CI" })],
    }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    const wfRow = container.querySelector(".health-workflow-row")!
    // Second td is the last-run cell
    const lastRunTd = wfRow.querySelectorAll("td")[1]
    expect(lastRunTd?.classList.contains("health-last-run")).toBe(true)
  })

  it("repo-level last-run cell has health-last-run class for no-wrap", () => {
    const repo = makeRepo({ fullName: "owner/repo" })
    const repoRuns = [{ name: "repo", fullName: "owner/repo", runs: [makeRun()] }]
    const { container } = render(<HealthTable repoRuns={repoRuns} repos={[repo]} />)
    const repoRow = container.querySelector(".health-repo-row")!
    const lastRunTd = repoRow.querySelectorAll("td")[1]
    expect(lastRunTd?.classList.contains("health-last-run")).toBe(true)
  })
})

// ── BuildTrendsCard ───────────────────────────────────────────────────────────

describe("BuildTrendsCard", () => {
  it("renders nothing when no repos have runs", () => {
    const repos = [makeRepo()]
    const repoRuns = [{ name: "repo-1", fullName: "owner/repo-1", runs: [] }]
    const { container } = render(<BuildTrendsCard repoRuns={repoRuns} repos={repos} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders one trend chart per repo that has runs", () => {
    const repos = [makeRepo(), makeRepo()]
    const repoRuns = [
      { name: "repo-1", fullName: "owner/repo-1", runs: [makeRun()] },
      { name: "repo-2", fullName: "owner/repo-2", runs: [makeRun()] },
    ]
    render(<BuildTrendsCard repoRuns={repoRuns} repos={repos} />)
    expect(screen.getAllByTestId("trend-chart")).toHaveLength(2)
  })

  it("skips repos without runs when rendering charts", () => {
    const repos = [makeRepo(), makeRepo()]
    const repoRuns = [
      { name: "repo-1", fullName: "owner/repo-1", runs: [makeRun()] },
      { name: "repo-2", fullName: "owner/repo-2", runs: [] },
    ]
    render(<BuildTrendsCard repoRuns={repoRuns} repos={repos} />)
    expect(screen.getAllByTestId("trend-chart")).toHaveLength(1)
  })
})
