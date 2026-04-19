import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Badge, StatusBadge, TierBadge } from "./Badge.js"

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Hello</Badge>)
    expect(screen.getByText("Hello")).toBeInTheDocument()
  })

  it("applies default neutral variant class", () => {
    const { container } = render(<Badge>X</Badge>)
    expect(container.firstChild).toHaveClass("badge-neutral")
  })

  it("applies specified variant class", () => {
    const { container } = render(<Badge variant="success">X</Badge>)
    expect(container.firstChild).toHaveClass("badge-success")
  })

  it("applies extra className", () => {
    const { container } = render(<Badge className="custom">X</Badge>)
    expect(container.firstChild).toHaveClass("custom")
  })
})

describe("StatusBadge", () => {
  it("renders Running label for in_progress", () => {
    render(<StatusBadge status="in_progress" conclusion={null} />)
    expect(screen.getByText("Running")).toBeInTheDocument()
  })

  it("renders Success label for completed/success", () => {
    render(<StatusBadge status="completed" conclusion="success" />)
    expect(screen.getByText("Success")).toBeInTheDocument()
  })

  it("renders Failure label for completed/failure", () => {
    render(<StatusBadge status="completed" conclusion="failure" />)
    expect(screen.getByText("Failure")).toBeInTheDocument()
  })

  it("renders Cancelled label for completed/cancelled", () => {
    render(<StatusBadge status="completed" conclusion="cancelled" />)
    expect(screen.getByText("Cancelled")).toBeInTheDocument()
  })

  it("applies badge-running class for in_progress", () => {
    const { container } = render(<StatusBadge status="in_progress" conclusion={null} />)
    expect(container.querySelector(".badge")).toHaveClass("badge-running")
  })

  it("applies badge-success class for successful run", () => {
    const { container } = render(<StatusBadge status="completed" conclusion="success" />)
    expect(container.querySelector(".badge")).toHaveClass("badge-success")
  })

  it("applies badge-failure class for failed run", () => {
    const { container } = render(<StatusBadge status="completed" conclusion="failure" />)
    expect(container.querySelector(".badge")).toHaveClass("badge-failure")
  })

  it("renders a spinner dot for running status", () => {
    const { container } = render(<StatusBadge status="in_progress" conclusion={null} />)
    expect(container.querySelector(".spinner")).toBeInTheDocument()
  })
})

describe("TierBadge", () => {
  it("renders tier label and score", () => {
    render(<TierBadge tier="gold" score={95} />)
    expect(screen.getByText(/Gold/)).toBeInTheDocument()
    expect(screen.getByText(/95/)).toBeInTheDocument()
  })

  it("applies correct badge class for gold", () => {
    const { container } = render(<TierBadge tier="gold" score={95} />)
    expect(container.firstChild).toHaveClass("badge-gold")
  })

  it("applies correct badge class for silver", () => {
    const { container } = render(<TierBadge tier="silver" score={75} />)
    expect(container.firstChild).toHaveClass("badge-silver")
  })

  it("applies correct badge class for bronze", () => {
    const { container } = render(<TierBadge tier="bronze" score={55} />)
    expect(container.firstChild).toHaveClass("badge-bronze")
  })
})
