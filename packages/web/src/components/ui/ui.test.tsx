import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Button } from "./Button.js"
import { Card, CardHeader } from "./Card.js"
import { EventBadge } from "./EventBadge.js"
import { Spinner, PageSpinner } from "./Spinner.js"

// ── Button ────────────────────────────────────────────────────────────────────

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText("Click me")).toBeInTheDocument()
  })

  it("applies btn class by default", () => {
    const { container } = render(<Button>X</Button>)
    expect(container.firstChild).toHaveClass("btn")
  })

  it("applies btn-primary for primary variant", () => {
    const { container } = render(<Button variant="primary">X</Button>)
    expect(container.firstChild).toHaveClass("btn-primary")
  })

  it("applies btn-danger for danger variant", () => {
    const { container } = render(<Button variant="danger">X</Button>)
    expect(container.firstChild).toHaveClass("btn-danger")
  })

  it("applies btn-sm for sm size", () => {
    const { container } = render(<Button size="sm">X</Button>)
    expect(container.firstChild).toHaveClass("btn-sm")
  })

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>X</Button>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("is disabled when loading", () => {
    render(<Button loading>X</Button>)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("shows spinner when loading", () => {
    const { container } = render(<Button loading>X</Button>)
    expect(container.querySelector(".spinner")).toBeInTheDocument()
  })

  it("does not show spinner when not loading", () => {
    const { container } = render(<Button>X</Button>)
    expect(container.querySelector(".spinner")).not.toBeInTheDocument()
  })

  it("calls onClick handler", () => {
    let clicked = false
    render(<Button onClick={() => { clicked = true }}>Click</Button>)
    fireEvent.click(screen.getByRole("button"))
    expect(clicked).toBe(true)
  })

  it("merges extra className", () => {
    const { container } = render(<Button className="extra">X</Button>)
    expect(container.firstChild).toHaveClass("extra")
  })
})

// ── Card ──────────────────────────────────────────────────────────────────────

describe("Card", () => {
  it("renders children inside .card", () => {
    const { container } = render(<Card><p>Content</p></Card>)
    expect(container.querySelector(".card")).toBeInTheDocument()
    expect(screen.getByText("Content")).toBeInTheDocument()
  })

  it("applies extra className", () => {
    const { container } = render(<Card className="highlight"><p /></Card>)
    expect(container.querySelector(".card")).toHaveClass("highlight")
  })
})

describe("CardHeader", () => {
  it("renders title", () => {
    render(<CardHeader title="My Section" />)
    expect(screen.getByText("My Section")).toBeInTheDocument()
  })

  it("renders actions when provided", () => {
    render(<CardHeader title="Title" actions={<button>Action</button>} />)
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument()
  })

  it("applies card-header class", () => {
    const { container } = render(<CardHeader title="X" />)
    expect(container.firstChild).toHaveClass("card-header")
  })
})

// ── EventBadge ────────────────────────────────────────────────────────────────

describe("EventBadge", () => {
  it.each([
    ["push", "push", "badge-push"],
    ["pull_request", "PR", "badge-pr"],
    ["pull_request_target", "PR", "badge-pr"],
    ["workflow_dispatch", "manual", "badge-manual"],
    ["schedule", "schedule", "badge-schedule"],
    ["workflow_call", "called", "badge-neutral"],
    ["release", "release", "badge-neutral"],
    ["custom_event", "custom_event", "badge-neutral"],
  ])("event %s → label %s and class %s", (event, label, cls) => {
    const { container } = render(<EventBadge event={event} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(container.firstChild).toHaveClass(cls)
  })
})

// ── Spinner ───────────────────────────────────────────────────────────────────

describe("Spinner", () => {
  it("renders with spinner class", () => {
    const { container } = render(<Spinner />)
    expect(container.firstChild).toHaveClass("spinner")
  })

  it("applies spinner-lg for lg size", () => {
    const { container } = render(<Spinner size="lg" />)
    expect(container.firstChild).toHaveClass("spinner-lg")
  })

  it("does not apply spinner-lg by default", () => {
    const { container } = render(<Spinner />)
    expect(container.firstChild).not.toHaveClass("spinner-lg")
  })

  it("merges extra className", () => {
    const { container } = render(<Spinner className="custom" />)
    expect(container.firstChild).toHaveClass("custom")
  })
})

describe("PageSpinner", () => {
  it("renders a large spinner inside a flex container", () => {
    const { container } = render(<PageSpinner />)
    expect(container.querySelector(".spinner-lg")).toBeInTheDocument()
  })
})
