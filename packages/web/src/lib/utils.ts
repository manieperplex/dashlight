import type { RunConclusion, RunStatus, ScoreTier } from "../types/index.js"

// ── Duration formatting ───────────────────────────────────────────────────────

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—"
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
}

// ── Date formatting ───────────────────────────────────────────────────────────

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDay > 365 ? "numeric" : undefined })
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

// ── Status helpers ────────────────────────────────────────────────────────────

export type StatusVariant = "success" | "failure" | "running" | "pending" | "cancelled" | "neutral"

export function runStatusVariant(status: RunStatus, conclusion: RunConclusion): StatusVariant {
  if (status === "in_progress" || status === "queued" || status === "waiting") return "running"
  if (status === "completed") {
    switch (conclusion) {
      case "success": return "success"
      case "failure":
      case "timed_out":
      case "action_required": return "failure"
      case "cancelled": return "cancelled"
      case "skipped":
      case "neutral": return "neutral"
      default: return "neutral"
    }
  }
  return "pending"
}

export function runStatusLabel(status: RunStatus, conclusion: RunConclusion): string {
  if (status === "in_progress") return "Running"
  if (status === "queued") return "Queued"
  if (status === "waiting") return "Waiting"
  if (status === "completed" && conclusion) {
    return conclusion.charAt(0).toUpperCase() + conclusion.replace(/_/g, " ").slice(1)
  }
  return status
}

// ── Score helpers ─────────────────────────────────────────────────────────────

export function tierLabel(tier: ScoreTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function tierColor(tier: ScoreTier): string {
  switch (tier) {
    case "gold": return "#f59e0b"
    case "silver": return "#6b7280"
    case "bronze": return "#b45309"
  }
}

// ── Run summary computation ───────────────────────────────────────────────────

export function computeRunSummary(runs: { status: RunStatus; conclusion: RunConclusion }[]): {
  total: number
  success: number
  failure: number
  inProgress: number
  successRate: number
} {
  const total = runs.length
  const inProgress = runs.filter((r) => r.status === "in_progress" || r.status === "queued").length
  const completed = runs.filter((r) => r.status === "completed")
  const success = completed.filter((r) => r.conclusion === "success").length
  const failure = completed.filter(
    (r) => r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "action_required"
  ).length
  const successRate = completed.length > 0 ? success / completed.length : 0
  return { total, success, failure, inProgress, successRate }
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str
}
