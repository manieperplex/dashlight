import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockUseQuery } = vi.hoisted(() => ({ mockUseQuery: vi.fn() }))

vi.mock("@tanstack/react-query", () => ({
  useIsFetching: vi.fn(() => 0),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  useQuery: mockUseQuery,
}))

vi.mock("../../api/index.js", () => ({
  logout: vi.fn(),
  clearServerCache: vi.fn().mockResolvedValue(undefined),
  getAuthConfig: vi.fn(),
}))

vi.mock("../../context/ThemeContext.js", () => ({
  useTheme: vi.fn(),
}))

vi.mock("../ui/Button.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))

vi.mock("../ui/Spinner.js", () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useTheme } from "../../context/ThemeContext.js"
import { Header } from "./Header.js"
import type { SessionUser, AuthConfig } from "../../types/index.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockToggleTheme = vi.fn()
const user: SessionUser = { login: "jan", avatarUrl: "https://example.com/av.png", name: "Jan" }

function withConfig(config: AuthConfig | undefined) {
  mockUseQuery.mockReturnValue({ data: config })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useTheme).mockReturnValue({ theme: "light", toggleTheme: mockToggleTheme })
  // Default: OAuth mode
  withConfig({ mode: "oauth", passwordRequired: false })
})

// ── Sync button ───────────────────────────────────────────────────────────────

describe("sync button", () => {
  it("has title 'Clear cache and reload'", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: "Sync" })).toHaveAttribute("title", "Clear cache and reload")
  })

  it("has aria-label 'Sync'", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: "Sync" })).toBeInTheDocument()
  })
})

// ── Theme toggle ──────────────────────────────────────────────────────────────

describe("theme toggle — light mode", () => {
  it("shows moon icon button (aria-label Switch to dark mode)", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument()
  })

  it("tooltip reads 'Come to the dark side'", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: "Switch to dark mode" }))
      .toHaveAttribute("title", "Come to the dark side")
  })

  it("clicking the theme button calls toggleTheme", () => {
    render(<Header user={user} />)
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }))
    expect(mockToggleTheme).toHaveBeenCalledOnce()
  })
})

describe("theme toggle — dark mode", () => {
  beforeEach(() => {
    vi.mocked(useTheme).mockReturnValue({ theme: "dark", toggleTheme: mockToggleTheme })
  })

  it("shows sun icon button (aria-label Switch to light mode)", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument()
  })

  it("tooltip reads 'Come to the bright side'", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: "Switch to light mode" }))
      .toHaveAttribute("title", "Come to the bright side")
  })

  it("clicking the theme button calls toggleTheme", () => {
    render(<Header user={user} />)
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }))
    expect(mockToggleTheme).toHaveBeenCalledOnce()
  })
})

// ── User info ─────────────────────────────────────────────────────────────────

describe("user info", () => {
  it("shows user login", () => {
    render(<Header user={user} />)
    expect(screen.getByText("jan")).toBeInTheDocument()
  })

  it("shows user avatar", () => {
    render(<Header user={user} />)
    expect(screen.getByAltText("jan")).toBeInTheDocument()
  })

  it("shows sign out button in OAuth mode", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument()
  })
})

// ── PAT mode ──────────────────────────────────────────────────────────────────

describe("PAT mode — open access (no password)", () => {
  beforeEach(() => withConfig({ mode: "pat", passwordRequired: false }))

  it("shows Token badge", () => {
    render(<Header user={user} />)
    expect(screen.getByText("Token")).toBeInTheDocument()
  })

  it("hides sign out button", () => {
    render(<Header user={user} />)
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull()
  })
})

describe("PAT mode — with password", () => {
  beforeEach(() => withConfig({ mode: "pat", passwordRequired: true }))

  it("shows Token badge", () => {
    render(<Header user={user} />)
    expect(screen.getByText("Token")).toBeInTheDocument()
  })

  it("shows sign out button", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument()
  })
})

describe("authConfig not yet loaded (undefined)", () => {
  beforeEach(() => withConfig(undefined))

  it("shows sign out button as safe default", () => {
    render(<Header user={user} />)
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument()
  })

  it("does not show Token badge", () => {
    render(<Header user={user} />)
    expect(screen.queryByText("Token")).toBeNull()
  })
})
