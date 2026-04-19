import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  formatDuration,
  formatRelativeTime,
  formatDateTime,
  runStatusVariant,
  runStatusLabel,
  computeRunSummary,
  classNames,
  truncate,
  tierLabel,
  tierColor,
} from "./utils.js"

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("returns — when startedAt is null", () => {
    expect(formatDuration(null, null)).toBe("—")
  })

  it("formats seconds only", () => {
    const start = "2024-01-01T00:00:00Z"
    const end = "2024-01-01T00:00:45Z"
    expect(formatDuration(start, end)).toBe("45s")
  })

  it("formats minutes without remainder seconds", () => {
    const start = "2024-01-01T00:00:00Z"
    const end = "2024-01-01T00:03:00Z"
    expect(formatDuration(start, end)).toBe("3m")
  })

  it("formats minutes with seconds", () => {
    const start = "2024-01-01T00:00:00Z"
    const end = "2024-01-01T00:02:30Z"
    expect(formatDuration(start, end)).toBe("2m 30s")
  })

  it("formats hours without remainder minutes", () => {
    const start = "2024-01-01T00:00:00Z"
    const end = "2024-01-01T02:00:00Z"
    expect(formatDuration(start, end)).toBe("2h")
  })

  it("formats hours with remainder minutes", () => {
    const start = "2024-01-01T00:00:00Z"
    const end = "2024-01-01T01:15:00Z"
    expect(formatDuration(start, end)).toBe("1h 15m")
  })

  it("uses current time when completedAt is null", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01T00:01:30Z"))
    const start = "2024-01-01T00:00:00Z"
    expect(formatDuration(start, null)).toBe("1m 30s")
    vi.useRealTimers()
  })
})

// ── formatRelativeTime ────────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("returns — for null", () => {
    expect(formatRelativeTime(null)).toBe("—")
  })

  it('returns "just now" for < 60 seconds ago', () => {
    vi.setSystemTime(new Date("2024-01-01T00:00:45Z"))
    expect(formatRelativeTime("2024-01-01T00:00:00Z")).toBe("just now")
  })

  it("returns minutes ago for < 60 minutes", () => {
    vi.setSystemTime(new Date("2024-01-01T00:30:00Z"))
    expect(formatRelativeTime("2024-01-01T00:00:00Z")).toBe("30m ago")
  })

  it("returns hours ago for < 24 hours", () => {
    vi.setSystemTime(new Date("2024-01-01T05:00:00Z"))
    expect(formatRelativeTime("2024-01-01T00:00:00Z")).toBe("5h ago")
  })

  it("returns days ago for < 30 days", () => {
    vi.setSystemTime(new Date("2024-01-15T00:00:00Z"))
    expect(formatRelativeTime("2024-01-01T00:00:00Z")).toBe("14d ago")
  })

  it("returns formatted date for >= 30 days", () => {
    vi.setSystemTime(new Date("2024-03-01T00:00:00Z"))
    const result = formatRelativeTime("2024-01-01T00:00:00Z")
    expect(result).toMatch(/Jan/)
  })
})

// ── formatDateTime ────────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("returns — for null", () => {
    expect(formatDateTime(null)).toBe("—")
  })

  it("returns a non-empty string for a valid date", () => {
    const result = formatDateTime("2024-06-15T10:30:00Z")
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toBe("—")
  })
})

// ── runStatusVariant ──────────────────────────────────────────────────────────

describe("runStatusVariant", () => {
  it("returns running for in_progress", () => {
    expect(runStatusVariant("in_progress", null)).toBe("running")
  })

  it("returns running for queued", () => {
    expect(runStatusVariant("queued", null)).toBe("running")
  })

  it("returns running for waiting", () => {
    expect(runStatusVariant("waiting", null)).toBe("running")
  })

  it("returns success for completed/success", () => {
    expect(runStatusVariant("completed", "success")).toBe("success")
  })

  it("returns failure for completed/failure", () => {
    expect(runStatusVariant("completed", "failure")).toBe("failure")
  })

  it("returns failure for completed/timed_out", () => {
    expect(runStatusVariant("completed", "timed_out")).toBe("failure")
  })

  it("returns failure for completed/action_required", () => {
    expect(runStatusVariant("completed", "action_required")).toBe("failure")
  })

  it("returns cancelled for completed/cancelled", () => {
    expect(runStatusVariant("completed", "cancelled")).toBe("cancelled")
  })

  it("returns neutral for completed/skipped", () => {
    expect(runStatusVariant("completed", "skipped")).toBe("neutral")
  })

  it("returns neutral for completed/neutral", () => {
    expect(runStatusVariant("completed", "neutral")).toBe("neutral")
  })

  it("returns pending for other statuses", () => {
    expect(runStatusVariant("pending", null)).toBe("pending")
  })
})

// ── runStatusLabel ────────────────────────────────────────────────────────────

describe("runStatusLabel", () => {
  it("returns Running for in_progress", () => {
    expect(runStatusLabel("in_progress", null)).toBe("Running")
  })

  it("returns Queued for queued", () => {
    expect(runStatusLabel("queued", null)).toBe("Queued")
  })

  it("returns Waiting for waiting", () => {
    expect(runStatusLabel("waiting", null)).toBe("Waiting")
  })

  it("capitalises conclusion for completed runs", () => {
    expect(runStatusLabel("completed", "success")).toBe("Success")
    expect(runStatusLabel("completed", "failure")).toBe("Failure")
    expect(runStatusLabel("completed", "cancelled")).toBe("Cancelled")
  })

  it("replaces underscores with spaces in conclusion", () => {
    expect(runStatusLabel("completed", "timed_out")).toBe("Timed out")
  })

  it("returns status string when completed with null conclusion", () => {
    expect(runStatusLabel("completed", null)).toBe("completed")
  })
})

// ── computeRunSummary ─────────────────────────────────────────────────────────

describe("computeRunSummary", () => {
  it("returns zeros for empty array", () => {
    const s = computeRunSummary([])
    expect(s).toEqual({ total: 0, success: 0, failure: 0, inProgress: 0, successRate: 0 })
  })

  it("counts in-progress and queued as inProgress", () => {
    const s = computeRunSummary([
      { status: "in_progress", conclusion: null },
      { status: "queued", conclusion: null },
    ])
    expect(s.inProgress).toBe(2)
    expect(s.total).toBe(2)
  })

  it("computes successRate from completed runs only", () => {
    const s = computeRunSummary([
      { status: "completed", conclusion: "success" },
      { status: "completed", conclusion: "success" },
      { status: "completed", conclusion: "failure" },
      { status: "in_progress", conclusion: null },
    ])
    expect(s.successRate).toBeCloseTo(2 / 3)
    expect(s.success).toBe(2)
    expect(s.failure).toBe(1)
    expect(s.inProgress).toBe(1)
    expect(s.total).toBe(4)
  })

  it("counts timed_out and action_required as failure", () => {
    const s = computeRunSummary([
      { status: "completed", conclusion: "timed_out" },
      { status: "completed", conclusion: "action_required" },
    ])
    expect(s.failure).toBe(2)
    expect(s.successRate).toBe(0)
  })

  it("returns successRate 0 when no completed runs", () => {
    const s = computeRunSummary([{ status: "in_progress", conclusion: null }])
    expect(s.successRate).toBe(0)
  })

  it("returns successRate 1 for all-success", () => {
    const s = computeRunSummary([
      { status: "completed", conclusion: "success" },
      { status: "completed", conclusion: "success" },
    ])
    expect(s.successRate).toBe(1)
  })
})

// ── classNames ────────────────────────────────────────────────────────────────

describe("classNames", () => {
  it("joins truthy strings", () => {
    expect(classNames("a", "b", "c")).toBe("a b c")
  })

  it("filters falsy values", () => {
    expect(classNames("a", false, null, undefined, "b")).toBe("a b")
  })

  it("returns empty string for all falsy", () => {
    expect(classNames(false, null, undefined)).toBe("")
  })
})

// ── truncate ──────────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns original string when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })

  it("truncates and appends ellipsis when over limit", () => {
    expect(truncate("hello world", 8)).toBe("hello w…")
  })

  it("truncates at exact limit boundary", () => {
    expect(truncate("12345", 5)).toBe("12345")
    expect(truncate("123456", 5)).toBe("1234…")
  })
})

// ── tierLabel / tierColor ─────────────────────────────────────────────────────

describe("tierLabel", () => {
  it("capitalises gold", () => expect(tierLabel("gold")).toBe("Gold"))
  it("capitalises silver", () => expect(tierLabel("silver")).toBe("Silver"))
  it("capitalises bronze", () => expect(tierLabel("bronze")).toBe("Bronze"))
})

describe("tierColor", () => {
  it("returns amber for gold", () => expect(tierColor("gold")).toBe("#f59e0b"))
  it("returns grey for silver", () => expect(tierColor("silver")).toBe("#6b7280"))
  it("returns brown for bronze", () => expect(tierColor("bronze")).toBe("#b45309"))
})
