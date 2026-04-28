import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createFileRoute: () => (opts: any) => opts,
  redirect: vi.fn(),
  isRedirect: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
  useLoaderData: vi.fn(),
}))

vi.mock("../api/index.js", () => ({
  getMe: vi.fn(),
  getAuthConfig: vi.fn(),
  patLogin: vi.fn(),
}))

vi.mock("../components/ui/DashlightLogo.js", () => ({
  DashlightLogo: ({ size }: { size?: number }) => <svg data-testid="dashlight-logo" width={size} height={size} />,
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useNavigate, useLoaderData } from "@tanstack/react-router"
import { patLogin } from "../api/index.js"
import { Route } from "./login.js"
import type { AuthConfig } from "../types/index.js"

const LoginPage = Route.component as React.FC

const mockNavigate = vi.fn()
const mockPatLogin = vi.mocked(patLogin)
const mockUseLoaderData = vi.mocked(useLoaderData)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
})

// helper to render with a given auth config loaded
function renderWithConfig(config: AuthConfig) {
  mockUseLoaderData.mockReturnValue(config)
  render(<LoginPage />)
}

// ── OAuth mode ────────────────────────────────────────────────────────────────

describe("OAuth mode", () => {
  const oauthConfig: AuthConfig = { mode: "oauth", passwordRequired: false }

  it("renders the Dashlight logo", () => {
    renderWithConfig(oauthConfig)
    expect(screen.getByTestId("dashlight-logo")).toBeInTheDocument()
  })

  it("renders the 'Dashlight' brand name", () => {
    renderWithConfig(oauthConfig)
    expect(screen.getByText("Dashlight")).toBeInTheDocument()
  })

  it("renders a 'Sign in with GitHub' link", () => {
    renderWithConfig(oauthConfig)
    expect(screen.getByRole("link", { name: /sign in with github/i })).toBeInTheDocument()
  })

  it("sign-in link points to /auth/login", () => {
    renderWithConfig(oauthConfig)
    expect(screen.getByRole("link", { name: /sign in with github/i }))
      .toHaveAttribute("href", "/auth/login")
  })

  it("does not render a password input", () => {
    renderWithConfig(oauthConfig)
    expect(screen.queryByPlaceholderText("Enter password")).toBeNull()
  })
})

// ── PAT + password mode ───────────────────────────────────────────────────────

describe("PAT + password mode", () => {
  const patConfig: AuthConfig = { mode: "pat", passwordRequired: true }

  it("renders the Dashlight logo", () => {
    renderWithConfig(patConfig)
    expect(screen.getByTestId("dashlight-logo")).toBeInTheDocument()
  })

  it("renders a password input", () => {
    renderWithConfig(patConfig)
    expect(screen.getByPlaceholderText("Enter password")).toBeInTheDocument()
  })

  it("renders a 'Sign in' submit button", () => {
    renderWithConfig(patConfig)
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
  })

  it("does not render the GitHub OAuth link", () => {
    renderWithConfig(patConfig)
    expect(screen.queryByRole("link", { name: /sign in with github/i })).toBeNull()
  })

  it("submit button is disabled when password is empty", () => {
    renderWithConfig(patConfig)
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled()
  })

  it("submit button is enabled after typing a password", () => {
    renderWithConfig(patConfig)
    fireEvent.change(screen.getByPlaceholderText("Enter password"), { target: { value: "secret" } })
    expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled()
  })

  it("calls patLogin with the entered password on submit", async () => {
    mockPatLogin.mockResolvedValue(undefined)
    renderWithConfig(patConfig)
    fireEvent.change(screen.getByPlaceholderText("Enter password"), { target: { value: "mypassword" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))
    await waitFor(() => expect(mockPatLogin).toHaveBeenCalledWith("mypassword"))
  })

  it("navigates to / on successful login", async () => {
    mockPatLogin.mockResolvedValue(undefined)
    renderWithConfig(patConfig)
    fireEvent.change(screen.getByPlaceholderText("Enter password"), { target: { value: "good" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: "/" }))
  })

  it("shows error message on wrong password", async () => {
    mockPatLogin.mockRejectedValue(new Error("401"))
    renderWithConfig(patConfig)
    fireEvent.change(screen.getByPlaceholderText("Enter password"), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument())
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid password/i)
  })
})
