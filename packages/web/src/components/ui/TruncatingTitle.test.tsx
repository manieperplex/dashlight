import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TruncatingTitle } from "./TruncatingTitle.js"

// ── ResizeObserver mock ───────────────────────────────────────────────────────

// Arrow functions cannot be constructors — use a class so `new ResizeObserver()` works.
const mockObserve = vi.fn()
const mockDisconnect = vi.fn()

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe = mockObserve
    disconnect = mockDisconnect
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ── Overflow predicate helpers ────────────────────────────────────────────────

/** Overflow predicate: overflows while the candidate text contains `needle`. */
const overflowsWhile = (needle: string) => (el: HTMLSpanElement) =>
  Boolean(el.textContent?.includes(needle))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TruncatingTitle", () => {
  // ── No-overflow cases ───────────────────────────────────────────────────────

  it("renders all items when none overflow", () => {
    render(<TruncatingTitle prefix="Health" items={["publish", "scan", "deploy"]} />)
    expect(screen.getByText("Health: publish, scan, deploy")).toBeInTheDocument()
  })

  it("renders a single item without a +N suffix", () => {
    render(<TruncatingTitle prefix="Health" items={["publish"]} />)
    expect(screen.getByText("Health: publish")).toBeInTheDocument()
    expect(screen.queryByText(/more/)).not.toBeInTheDocument()
  })

  it("applies the className to the span", () => {
    const { container } = render(
      <TruncatingTitle prefix="H" items={["a"]} className="card-title" />
    )
    expect(container.querySelector(".card-title")).toBeInTheDocument()
  })

  it("does not show +N suffix when the explicit predicate returns false", () => {
    render(
      <TruncatingTitle
        prefix="Health"
        items={["publish", "scan"]}
        _isOverflowing={() => false}
      />
    )
    expect(screen.queryByText(/more/)).not.toBeInTheDocument()
    expect(screen.getByText("Health: publish, scan")).toBeInTheDocument()
  })

  // ── Overflow reduction (single-pass, synchronous) ───────────────────────────

  it("reduces to 1 item + +N more when always overflowing", () => {
    render(
      <TruncatingTitle
        prefix="Health"
        items={["publish", "scan", "deploy"]}
        _isOverflowing={() => true}
      />
    )
    expect(screen.getByText("Health: publish +2 more")).toBeInTheDocument()
  })

  it("stops reducing when overflow is resolved", () => {
    // Overflowing while the full third-item string ", deploy" is present
    render(
      <TruncatingTitle
        prefix="Health"
        items={["publish", "scan", "deploy"]}
        _isOverflowing={overflowsWhile(", deploy")}
      />
    )
    // "Health: publish, scan +1 more" — no longer contains ", deploy" → stops
    expect(screen.getByText("Health: publish, scan +1 more")).toBeInTheDocument()
  })

  it("shows the correct +N count", () => {
    render(
      <TruncatingTitle
        prefix="X"
        items={["a", "b", "c", "d", "e"]}
        _isOverflowing={() => true}
      />
    )
    expect(screen.getByText("X: a +4 more")).toBeInTheDocument()
  })

  it("stops at 1 item minimum and does not show +0 suffix", () => {
    // With a single item, there is nothing to truncate further;
    // the while loop never executes and we end up showing the 1 item without suffix.
    render(
      <TruncatingTitle
        prefix="X"
        items={["only"]}
        _isOverflowing={() => true}
      />
    )
    expect(screen.getByText("X: only")).toBeInTheDocument()
    expect(screen.queryByText(/more/)).not.toBeInTheDocument()
  })

  // ── Items change ────────────────────────────────────────────────────────────

  it("expands back to full when items change and new set fits", () => {
    const { rerender } = render(
      <TruncatingTitle
        prefix="Health"
        items={["publish", "scan"]}
        _isOverflowing={() => true}
      />
    )
    expect(screen.getByText("Health: publish +1 more")).toBeInTheDocument()

    rerender(
      <TruncatingTitle
        prefix="Health"
        items={["alpha", "beta"]}
        _isOverflowing={() => false}
      />
    )
    expect(screen.getByText("Health: alpha, beta")).toBeInTheDocument()
  })

  it("re-applies reduction after items change when still overflowing", () => {
    const { rerender } = render(
      <TruncatingTitle prefix="X" items={["a"]} _isOverflowing={() => false} />
    )
    expect(screen.getByText("X: a")).toBeInTheDocument()

    rerender(
      <TruncatingTitle prefix="X" items={["a", "b", "c"]} _isOverflowing={() => true} />
    )
    expect(screen.getByText("X: a +2 more")).toBeInTheDocument()
  })

  // ── Prefix-less mode ───────────────────────────────────────────────────────

  it("renders items without a prefix or colon when prefix is omitted", () => {
    render(<TruncatingTitle items={["publish", "scan"]} />)
    expect(screen.getByText("publish, scan")).toBeInTheDocument()
    expect(screen.queryByText(/:/)).not.toBeInTheDocument()
  })

  it("truncates correctly with no prefix", () => {
    render(
      <TruncatingTitle
        items={["publish", "scan", "deploy"]}
        _isOverflowing={() => true}
      />
    )
    expect(screen.getByText("publish +2 more")).toBeInTheDocument()
  })

  // ── ResizeObserver lifecycle ────────────────────────────────────────────────

  it("sets up a ResizeObserver on mount", () => {
    render(<TruncatingTitle prefix="H" items={["a"]} />)
    expect(mockObserve).toHaveBeenCalled()
  })

  it("disconnects the ResizeObserver on unmount", () => {
    const { unmount } = render(<TruncatingTitle prefix="H" items={["a"]} />)
    unmount()
    expect(mockDisconnect).toHaveBeenCalled()
  })
})
