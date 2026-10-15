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

import { WorkflowHealthSection, repoDisplayLabel, resolveWatchedWorkflows } from "./WorkflowHealthSection.js"
import type { WatchedWorkflowCard } from "./WorkflowHealthSection.js"
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

function makeCard(overrides: Partial<WatchedWorkflowCard> = {}): WatchedWorkflowCard {
  return {
    fullName: "owner/repo",
    workflowId: ++_id,
    catalogName: "publish",
    run: makeRun({ workflowName: "publish" }),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkflowHealthSection", () => {
  it("returns nothing when watchWorkflows is empty", () => {
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={[]} cards={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("returns nothing when cards is empty", () => {
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["publish"]} cards={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders 'Workflow Health' as the section title", () => {
    const cards = [makeCard()]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    expect(screen.getByText("Workflow Health")).toBeInTheDocument()
  })

  it("renders workflow names as a subtitle on a separate element", () => {
    const cards = [makeCard()]
    render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} cards={cards} />)
    expect(screen.getByText("publish, scan")).toBeInTheDocument()
  })

  it("title and subtitle are separate DOM elements", () => {
    const cards = [makeCard()]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} cards={cards} />)
    const title = container.querySelector(".card-title")
    const subtitle = container.querySelector(".card-header .text-muted.text-small")
    expect(title?.textContent).toBe("Workflow Health")
    expect(subtitle?.textContent).toBe("publish, scan")
  })

  it("card-header uses stretch alignment so the subtitle span is width-constrained", () => {
    const cards = [makeCard()]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    const header = container.querySelector(".card-header") as HTMLElement
    expect(header.style.alignItems).toBe("stretch")
  })

  it("shows only repo short-name when there is no name collision", () => {
    const cards = [makeCard({ fullName: "owner/repo" })]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    expect(screen.getByText("repo")).toBeInTheDocument()
    expect(screen.queryByText(/owner/)).not.toBeInTheDocument()
  })

  it("renders a card for each entry in cards", () => {
    const cards = [
      makeCard({ catalogName: "publish" }),
      makeCard({ catalogName: "scan", run: makeRun({ workflowName: "scan" }) }),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish", "scan"]} cards={cards} />)
    expect(screen.getByText("publish")).toBeInTheDocument()
    expect(screen.getByText("scan")).toBeInTheDocument()
  })

  it("shows cards for multiple repos in a single flat grid", () => {
    const cards = [
      makeCard({ fullName: "owner/repo-a" }),
      makeCard({ fullName: "owner/repo-b" }),
    ]
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />
    )
    expect(screen.getByText("repo-a")).toBeInTheDocument()
    expect(screen.getByText("repo-b")).toBeInTheDocument()
    expect(container.querySelectorAll(".latest-runs-grid")).toHaveLength(1)
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(2)
  })

  it("renders an in-progress card with a pulse dot", () => {
    const cards = [makeCard({
      run: makeRun({ workflowName: "publish", status: "in_progress", conclusion: null }),
    })]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    const dots = document.querySelectorAll(".run-dot-pulse")
    expect(dots.length).toBeGreaterThan(0)
  })

  it("renders a card with null run (no runs yet) showing 'No runs yet'", () => {
    const cards = [makeCard({ run: null, catalogName: "Publish" })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["Publish"]} cards={cards} />)
    expect(screen.getByText("No runs yet")).toBeInTheDocument()
    // catalogName appears in both the subtitle and the card — verify the card has it
    const card = container.querySelector(".latest-run-card")!
    expect(card.textContent).toContain("Publish")
  })

  it("shows abbreviated owner prefix when two repos share the same short-name", () => {
    const cards = [
      makeCard({ fullName: "manifold/api" }),
      makeCard({ fullName: "acmecorp/api" }),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    expect(screen.getByText("man…/")).toBeInTheDocument()
    expect(screen.getByText("acm…/")).toBeInTheDocument()
    expect(screen.getAllByText("api")).toHaveLength(2)
  })

  it("does not show owner prefix for repos whose short-name is unique", () => {
    const cards = [
      makeCard({ fullName: "manifold/api" }),
      makeCard({ fullName: "acmecorp/api" }),
      makeCard({ fullName: "acmecorp/website" }),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    expect(screen.getByText("man…/")).toBeInTheDocument()
    expect(screen.getByText("acm…/")).toBeInTheDocument()
    expect(screen.getByText("website")).toBeInTheDocument()
    expect(screen.queryByText(/acm…\/.*website/)).not.toBeInTheDocument()
  })

  it("uses catalogName (not run.workflowName) for display", () => {
    const cards = [makeCard({
      catalogName: "Dependabot Updates",
      run: makeRun({ workflowName: "dependency-update" }),
    })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["Dependabot Updates"]} cards={cards} />)
    // The catalog name should appear in the card link, not the raw run name
    const card = container.querySelector(".latest-run-card")!
    expect(card.textContent).toContain("Dependabot Updates")
    expect(card.textContent).not.toContain("dependency-update")
  })

  // ── No-runs card edge cases ──────────────────────────────────────────────────

  it("no-runs card has a neutral border (--color-border), not a status color", () => {
    const cards = [makeCard({ run: null })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    const card = container.querySelector(".latest-run-card") as HTMLElement
    expect(card.style.borderLeft).toContain("var(--color-border)")
  })

  it("no-runs card has no data-active attribute", () => {
    const cards = [makeCard({ run: null })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    const card = container.querySelector(".latest-run-card")!
    expect(card).not.toHaveAttribute("data-active")
  })

  it("no-runs card uses a span (not a link) for the workflow name", () => {
    const cards = [makeCard({ run: null, catalogName: "Deploy" })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["Deploy"]} cards={cards} />)
    const card = container.querySelector(".latest-run-card")!
    // The workflow name should be a span, not an anchor
    const nameEl = card.querySelector(".latest-run-workflow")!
    expect(nameEl.tagName).toBe("SPAN")
  })

  it("no-runs card does not contain branch/commit metadata", () => {
    const cards = [makeCard({ run: null })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    const card = container.querySelector(".latest-run-card")!
    expect(card.querySelector(".latest-run-meta")).toBeNull()
  })

  it("no-runs card has a neutral dot (not pulse, not status-colored)", () => {
    const cards = [makeCard({ run: null })]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    const card = container.querySelector(".latest-run-card")!
    const dot = card.querySelector(".run-dot")!
    expect(dot.classList.contains("run-dot-neutral")).toBe(true)
    expect(dot.classList.contains("run-dot-pulse")).toBe(false)
  })

  // ── Mixed cards (with and without runs) ──────────────────────────────────────

  it("renders both run-cards and no-run-cards together in one grid", () => {
    const cards = [
      makeCard({ fullName: "owner/repo-a", catalogName: "CI", run: makeRun({ workflowName: "CI" }) }),
      makeCard({ fullName: "owner/repo-b", catalogName: "CI", run: null }),
    ]
    const { container } = render(<WorkflowHealthSection watchWorkflows={["CI"]} cards={cards} />)
    const allCards = container.querySelectorAll(".latest-run-card")
    expect(allCards).toHaveLength(2)
    // First card has a run (link present)
    expect(allCards[0].querySelector("a.latest-run-card-link")).not.toBeNull()
    // Second card has no run (span, not link)
    expect(allCards[1].querySelector("a.latest-run-card-link")).toBeNull()
    expect(allCards[1].textContent).toContain("No runs yet")
  })

  it("no-runs card still shows owner prefix when repo names collide", () => {
    const cards = [
      makeCard({ fullName: "manifold/api", run: null }),
      makeCard({ fullName: "acmecorp/api", run: null }),
    ]
    render(<WorkflowHealthSection watchWorkflows={["publish"]} cards={cards} />)
    expect(screen.getByText("man…/")).toBeInTheDocument()
    expect(screen.getByText("acm…/")).toBeInTheDocument()
  })

  // ── Scenario simulation: the Cerberus bug ─────────────────────────────────────

  it("catalog-resolved card appears even when it would be missing from a repo-wide sample", () => {
    // Simulate: Cerberus has 6,412 runs. The top 100 are all CI/CodeQL.
    // Publish (workflowId 228720660) is run #101+.
    // Old approach: pass 100 runs, filter by name → Publish missing.
    // New approach: card is pre-resolved from the catalog, run fetched by scoped endpoint.
    const publishRun = makeRun({
      workflowId: 228720660,
      workflowName: "Publish",
      conclusion: "failure",
      createdAt: "2026-10-14T21:11:06Z",
    })
    // This card was resolved upstream — the component doesn't need to search for it
    const cards: WatchedWorkflowCard[] = [
      { fullName: "org/cerberus", workflowId: 228720660, catalogName: "Publish", run: publishRun },
    ]
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["Publish"]} cards={cards} />
    )
    const card = container.querySelector(".latest-run-card")!
    expect(card).not.toBeNull()
    expect(card.textContent).toContain("cerberus")
    // The failure conclusion should produce a failure dot
    expect(card.querySelector(".run-dot-failure")).not.toBeNull()
  })

  it("workflow with no runs (exists in catalog, never triggered) shows a card", () => {
    // Workflow exists in the catalog but has zero runs. The old approach would
    // never produce a card because there's no run with a matching name.
    const cards: WatchedWorkflowCard[] = [
      { fullName: "org/new-repo", workflowId: 999, catalogName: "Publish", run: null },
    ]
    const { container } = render(
      <WorkflowHealthSection watchWorkflows={["Publish"]} cards={cards} />
    )
    expect(container.querySelectorAll(".latest-run-card")).toHaveLength(1)
    expect(screen.getByText("No runs yet")).toBeInTheDocument()
  })
})

// ── repoDisplayLabel ──────────────────────────────────────────────────────────

describe("repoDisplayLabel", () => {
  it("returns null owner when repo name is unique", () => {
    const result = repoDisplayLabel("acme/api", new Set())
    expect(result).toEqual({ owner: null, repo: "api" })
  })

  it("returns abbreviated owner when repo name is in the duplicate set", () => {
    const result = repoDisplayLabel("manifold/api", new Set(["api"]))
    expect(result).toEqual({ owner: "man…", repo: "api" })
  })

  it("abbreviation uses exactly the first 3 characters of the owner", () => {
    const result = repoDisplayLabel("ab/api", new Set(["api"]))
    expect(result.owner).toBe("ab…")

    const result2 = repoDisplayLabel("abcdefgh/api", new Set(["api"]))
    expect(result2.owner).toBe("abc…")
  })

  it("extracts the repo part correctly for names containing slashes only once", () => {
    const result = repoDisplayLabel("my-org/my-repo", new Set())
    expect(result.repo).toBe("my-repo")
  })
})

// ── resolveWatchedWorkflows ──────────────────────────────────────────────────

describe("resolveWatchedWorkflows", () => {
  it("matches workflow names case-insensitively", () => {
    const result = resolveWatchedWorkflows(
      ["publish"],
      [{ fullName: "owner/repo", workflows: [{ id: 1, name: "Publish" }] }],
    )
    expect(result).toEqual([{ fullName: "owner/repo", workflowId: 1, catalogName: "Publish" }])
  })

  it("returns empty when no workflows match", () => {
    const result = resolveWatchedWorkflows(
      ["deploy"],
      [{ fullName: "owner/repo", workflows: [{ id: 1, name: "Publish" }] }],
    )
    expect(result).toEqual([])
  })

  it("matches across multiple repos", () => {
    const result = resolveWatchedWorkflows(
      ["CI"],
      [
        { fullName: "owner/repo-a", workflows: [{ id: 1, name: "CI" }] },
        { fullName: "owner/repo-b", workflows: [{ id: 2, name: "CI" }, { id: 3, name: "Deploy" }] },
      ],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ fullName: "owner/repo-a", workflowId: 1, catalogName: "CI" })
    expect(result[1]).toEqual({ fullName: "owner/repo-b", workflowId: 2, catalogName: "CI" })
  })

  it("does not use substring matching", () => {
    const result = resolveWatchedWorkflows(
      ["CI"],
      [{ fullName: "owner/repo", workflows: [{ id: 1, name: "CI Pipeline" }] }],
    )
    expect(result).toEqual([])
  })

  it("handles duplicate workflow names by returning all matches", () => {
    const result = resolveWatchedWorkflows(
      ["CI"],
      [{ fullName: "owner/repo", workflows: [{ id: 1, name: "CI" }, { id: 2, name: "CI" }] }],
    )
    expect(result).toHaveLength(2)
    expect(result[0].workflowId).toBe(1)
    expect(result[1].workflowId).toBe(2)
  })

  it("matches multiple watch names independently", () => {
    const result = resolveWatchedWorkflows(
      ["CI", "Publish"],
      [{ fullName: "owner/repo", workflows: [{ id: 1, name: "CI" }, { id: 2, name: "Publish" }, { id: 3, name: "Deploy" }] }],
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ fullName: "owner/repo", workflowId: 1, catalogName: "CI" })
    expect(result[1]).toEqual({ fullName: "owner/repo", workflowId: 2, catalogName: "Publish" })
  })

  it("returns empty for watch names that exist in no repo", () => {
    const result = resolveWatchedWorkflows(
      ["Nightly Build"],
      [
        { fullName: "owner/repo-a", workflows: [{ id: 1, name: "CI" }] },
        { fullName: "owner/repo-b", workflows: [{ id: 2, name: "Publish" }] },
      ],
    )
    expect(result).toEqual([])
  })

  it("does not match disabled/deleted workflows (they are simply in the catalog)", () => {
    // resolveWatchedWorkflows matches by name only; filtering by state is the caller's
    // responsibility (catalog includes disabled workflows). Verify it matches all names.
    const result = resolveWatchedWorkflows(
      ["CI"],
      [{ fullName: "owner/repo", workflows: [{ id: 1, name: "CI" }] }],
    )
    expect(result).toHaveLength(1)
  })

  it("a watch name present in repo A but absent in repo B only produces cards for A", () => {
    const result = resolveWatchedWorkflows(
      ["Publish"],
      [
        { fullName: "owner/cerberus", workflows: [{ id: 100, name: "CI" }, { id: 200, name: "Publish" }] },
        { fullName: "owner/tooling", workflows: [{ id: 300, name: "CI" }] },
      ],
    )
    expect(result).toHaveLength(1)
    expect(result[0].fullName).toBe("owner/cerberus")
    expect(result[0].workflowId).toBe(200)
  })

  it("skips repos with empty catalogs", () => {
    const result = resolveWatchedWorkflows(
      ["CI"],
      [
        { fullName: "owner/repo-a", workflows: [] },
        { fullName: "owner/repo-b", workflows: [{ id: 1, name: "CI" }] },
      ],
    )
    expect(result).toHaveLength(1)
    expect(result[0].fullName).toBe("owner/repo-b")
  })
})
