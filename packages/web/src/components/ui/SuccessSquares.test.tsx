import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SuccessSquares } from "./SuccessSquares.js"
import type { RunStatus, RunConclusion } from "../../types/index.js"

function run(status: RunStatus, conclusion: RunConclusion) {
  return { status, conclusion }
}

const SUCCESS = run("completed", "success")
const FAILURE = run("completed", "failure")
const CANCELLED = run("completed", "cancelled")
const IN_PROGRESS = run("in_progress", null)

describe("SuccessSquares", () => {
  it("renders — for empty runs", () => {
    render(<SuccessSquares runs={[]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders one square per run", () => {
    const { container } = render(<SuccessSquares runs={[SUCCESS, FAILURE, CANCELLED]} />)
    expect(container.querySelectorAll(".success-square")).toHaveLength(3)
  })

  it("caps squares at 30", () => {
    const runs = Array.from({ length: 50 }, () => SUCCESS)
    const { container } = render(<SuccessSquares runs={runs} />)
    expect(container.querySelectorAll(".success-square")).toHaveLength(30)
  })

  it("shows 100% for all-success runs", () => {
    render(<SuccessSquares runs={[SUCCESS, SUCCESS, SUCCESS]} />)
    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("shows 0% for all-failure runs", () => {
    render(<SuccessSquares runs={[FAILURE, FAILURE]} />)
    expect(screen.getByText("0%")).toBeInTheDocument()
  })

  it("computes correct percentage excluding in-progress", () => {
    // 2 success + 2 failure + 1 in_progress → 50%
    render(<SuccessSquares runs={[SUCCESS, SUCCESS, FAILURE, FAILURE, IN_PROGRESS]} />)
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("shows sparse indicator when fewer than 5 runs", () => {
    const { container } = render(<SuccessSquares runs={[SUCCESS, SUCCESS]} />)
    expect(container.querySelector(".success-squares-sparse")).toBeInTheDocument()
    expect(container.querySelector(".success-squares-sparse")?.textContent).toBe("2")
  })

  it("does not show sparse indicator when 5 or more runs", () => {
    const runs = Array.from({ length: 5 }, () => SUCCESS)
    const { container } = render(<SuccessSquares runs={runs} />)
    expect(container.querySelector(".success-squares-sparse")).not.toBeInTheDocument()
  })

  it("applies reduced opacity when muted", () => {
    const { container } = render(<SuccessSquares runs={[SUCCESS]} muted />)
    const squares = container.querySelector(".success-squares") as HTMLElement
    expect(squares.style.opacity).toBe("0.45")
  })

  it("applies full opacity when not muted", () => {
    const { container } = render(<SuccessSquares runs={[SUCCESS]} />)
    const squares = container.querySelector(".success-squares") as HTMLElement
    expect(squares.style.opacity).toBe("1")
  })

  it("sets title tooltip for sparse wrapper", () => {
    const { container } = render(<SuccessSquares runs={[SUCCESS]} />)
    const wrapper = container.querySelector(".success-squares-wrapper") as HTMLElement
    expect(wrapper.title).toContain("1 run")
  })

  it("adds tooltips to individual squares", () => {
    const { container } = render(<SuccessSquares runs={[SUCCESS, FAILURE]} />)
    const squares = container.querySelectorAll(".success-square")
    expect(squares[0]?.getAttribute("title")).toBeTruthy()
    expect(squares[1]?.getAttribute("title")).toBeTruthy()
  })
})
