import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => opts,
  redirect: vi.fn(),
  isRedirect: vi.fn(),
}))

vi.mock("../api/index.js", () => ({
  getMe: vi.fn(),
}))

vi.mock("../components/ui/DashlightLogo.js", () => ({
  DashlightLogo: ({ size }: { size?: number }) => <svg data-testid="dashlight-logo" width={size} height={size} />,
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { Route } from "./login.js"

const LoginPage = Route.component as React.FC

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  it("renders the Dashlight logo", () => {
    render(<LoginPage />)
    expect(screen.getByTestId("dashlight-logo")).toBeInTheDocument()
  })

  it("renders the 'Dashlight' brand name", () => {
    render(<LoginPage />)
    expect(screen.getByText("Dashlight")).toBeInTheDocument()
  })

  it("renders a 'Sign in with GitHub' link", () => {
    render(<LoginPage />)
    expect(screen.getByRole("link", { name: /sign in with github/i })).toBeInTheDocument()
  })

  it("sign-in link points to /auth/login", () => {
    render(<LoginPage />)
    expect(screen.getByRole("link", { name: /sign in with github/i }))
      .toHaveAttribute("href", "/auth/login")
  })

  it("does not render a title or subtitle", () => {
    render(<LoginPage />)
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.queryByText(/monitor all/i)).toBeNull()
    expect(screen.queryByText(/token is stored/i)).toBeNull()
  })
})
