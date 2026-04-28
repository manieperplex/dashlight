import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import type { Repository } from "../../types/index.js"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => opts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, params: _p, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useMatches: vi.fn(() => []),
  Outlet: () => null,
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}))

vi.mock("../../api/index.js", () => ({
  getRepos: vi.fn(),
  getRuns: vi.fn(),
}))

vi.mock("../../components/ui/Spinner.js", () => ({
  PageSpinner: () => <div data-testid="page-spinner" />,
}))

vi.mock("../../components/ui/Badge.js", () => ({
  StatusBadge: ({ status, conclusion }: { status: string; conclusion: string | null }) => (
    <span data-testid="status-badge">{conclusion ?? status}</span>
  ),
}))

vi.mock("../../components/ui/SuccessSquares.js", () => ({
  SuccessSquares: () => <div data-testid="success-squares" />,
}))

vi.mock("../../lib/utils.js", () => ({
  formatRelativeTime: (s: string | null) => (s ? "2 days ago" : "—"),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query"
import { useMatches } from "@tanstack/react-router"
import { Route } from "./repositories.js"

const Repositories = Route.component as React.FC

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 1,
    name: "api",
    fullName: "acme/api",
    owner: "acme",
    private: false,
    description: null,
    defaultBranch: "main",
    pushedAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    language: "TypeScript",
    stargazersCount: 0,
    openIssuesCount: 0,
    htmlUrl: "https://github.com/acme/api",
    topics: [],
    visibility: "public",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useMatches).mockReturnValue([{ routeId: "/_app/repositories" } as never])
  // Default: repos query returns empty, runs query returns empty
  vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: false } as never)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Repositories list", () => {
  it("shows spinner while loading", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never)
    render(<Repositories />)
    expect(screen.getByTestId("page-spinner")).toBeInTheDocument()
  })

  it("shows empty state when no repos", () => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as never)
    render(<Repositories />)
    expect(screen.getByText("No repositories found.")).toBeInTheDocument()
  })

  it("renders one row per repo", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo(), makeRepo({ id: 2, fullName: "acme/web", name: "web" })], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    const { container } = render(<Repositories />)
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
  })

  it("renders owner in muted span and repo name as link", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo()], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    const { container } = render(<Repositories />)
    expect(container.querySelector(".health-repo-label-owner")?.textContent).toBe("acme/")
    const link = screen.getByRole("link", { name: "api" })
    expect(link).toBeInTheDocument()
  })

  it("repo name link does not include the owner prefix", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo()], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    render(<Repositories />)
    expect(screen.getByRole("link", { name: "api" }).textContent).toBe("api")
  })

  it("shows language", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo({ language: "Go" })], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    render(<Repositories />)
    expect(screen.getByText("Go")).toBeInTheDocument()
  })

  it("shows '—' when language is null", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo({ language: null })], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    render(<Repositories />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows 'No runs' when there are no runs and actions are enabled", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo()], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    render(<Repositories />)
    expect(screen.getByText("No runs")).toBeInTheDocument()
  })

  it("shows 'Actions not enabled' when actionsDisabled is true", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: [makeRepo()], isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: true }, isLoading: false } as never)
    render(<Repositories />)
    expect(screen.getByText("Actions not enabled")).toBeInTheDocument()
  })

  // ── Alphabetical ordering ───────────────────────────────────────────────────

  it("renders repos in alphabetical order by fullName", () => {
    const repos = [
      makeRepo({ id: 1, fullName: "acme/zebra",  name: "zebra" }),
      makeRepo({ id: 2, fullName: "acme/alpha",  name: "alpha" }),
      makeRepo({ id: 3, fullName: "acme/middle", name: "middle" }),
    ]
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: repos, isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    const { container } = render(<Repositories />)
    const links = container.querySelectorAll("tbody tr td a")
    const names = Array.from(links).map((a) => a.textContent)
    expect(names).toEqual(["alpha", "middle", "zebra"])
  })

  it("sorting is stable regardless of the API response order", () => {
    const repos = [
      makeRepo({ id: 3, fullName: "org/charlie", name: "charlie" }),
      makeRepo({ id: 1, fullName: "org/alpha",   name: "alpha" }),
      makeRepo({ id: 2, fullName: "org/bravo",   name: "bravo" }),
    ]
    vi.mocked(useQuery)
      .mockReturnValueOnce({ data: repos, isLoading: false } as never)
      .mockReturnValue({ data: { runs: [], actionsDisabled: false }, isLoading: false } as never)
    const { container } = render(<Repositories />)
    const links = container.querySelectorAll("tbody tr td a")
    const names = Array.from(links).map((a) => a.textContent)
    expect(names).toEqual(["alpha", "bravo", "charlie"])
  })

  it("alphabetical order is preserved after filter narrows the list", () => {
    const repos = [
      makeRepo({ id: 1, fullName: "org/go-utils",  name: "go-utils",  language: "Go" }),
      makeRepo({ id: 2, fullName: "org/go-server",  name: "go-server",  language: "Go" }),
      makeRepo({ id: 3, fullName: "org/ts-client",  name: "ts-client",  language: "TypeScript" }),
    ]
    // Use mockImplementation so re-renders after fireEvent still get the right data per query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === "repos") {
        return { data: repos, isLoading: false } as never
      }
      return { data: { runs: [], actionsDisabled: false }, isLoading: false } as never
    })

    const { container } = render(<Repositories />)
    // All three visible and sorted before filtering
    let links = container.querySelectorAll("tbody tr td a")
    expect(Array.from(links).map((a) => a.textContent)).toEqual(["go-server", "go-utils", "ts-client"])

    // Type "go" — only the two go repos remain, still sorted
    fireEvent.change(screen.getByPlaceholderText("Search here..."), { target: { value: "go" } })

    links = container.querySelectorAll("tbody tr td a")
    expect(Array.from(links).map((a) => a.textContent)).toEqual(["go-server", "go-utils"])
  })
})
