import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

vi.mock("@tanstack/react-router", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}))

vi.mock("../ui/DashlightLogo.js", () => ({
  DashlightLogo: () => <span data-testid="logo" />,
}))

import { Sidebar } from "./Sidebar.js"

describe("Sidebar", () => {
  it("renders the Dashlight logo", () => {
    render(<Sidebar />)
    expect(screen.getByTestId("logo")).toBeInTheDocument()
  })

  it("renders a Dashboard nav link", () => {
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
  })

  it("renders a Repositories nav link", () => {
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: /repositories/i })).toBeInTheDocument()
  })

  it("renders a Runs nav link", () => {
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: /^runs$/i })).toBeInTheDocument()
  })

  it("does not render a Settings nav link", () => {
    render(<Sidebar />)
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument()
  })

  it("Runs link points to /runs", () => {
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: /^runs$/i })).toHaveAttribute("href", "/runs")
  })

  it("renders exactly 3 nav links", () => {
    render(<Sidebar />)
    expect(screen.getAllByRole("link")).toHaveLength(3)
  })
})
