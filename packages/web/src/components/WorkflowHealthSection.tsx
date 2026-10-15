import { Link } from "@tanstack/react-router"
import { Card } from "./ui/Card.js"
import { TruncatingTitle } from "./ui/TruncatingTitle.js"
import { formatDuration, formatRelativeTime, runStatusVariant, VARIANT_COLOR } from "../lib/utils.js"
import type { WorkflowRun } from "../types/index.js"

// ── Types ─────────────────────────────────────────────────────────────────────

/** A resolved watched-workflow card: identified by (repo, workflowId). */
export interface WatchedWorkflowCard {
  fullName: string          // "owner/repo"
  workflowId: number
  catalogName: string       // workflow name from the catalog (source of truth)
  run: WorkflowRun | null   // latest run, or null if workflow exists but has no runs
}

interface WorkflowHealthSectionProps {
  watchWorkflows: string[]
  cards: WatchedWorkflowCard[]
  /** Watch names that matched zero catalog entries across all repos. */
  unresolvedNames?: string[]
}

// ── Run dot ───────────────────────────────────────────────────────────────────

function RunDot({ status, conclusion }: { status: WorkflowRun["status"]; conclusion: WorkflowRun["conclusion"] }) {
  const isActive = status === "in_progress" || status === "queued"
  let colorClass = "run-dot-neutral"
  if (conclusion === "success") colorClass = "run-dot-success"
  else if (conclusion === "failure" || conclusion === "timed_out") colorClass = "run-dot-failure"
  else if (conclusion === "cancelled") colorClass = "run-dot-cancelled"
  else if (isActive) colorClass = "run-dot-running"
  return <span className={`run-dot ${colorClass}${isActive ? " run-dot-pulse" : ""}`} />
}

// ── Single run card ───────────────────────────────────────────────────────────

function HealthRunCard({ card, duplicateRepoNames }: {
  card: WatchedWorkflowCard
  duplicateRepoNames: Set<string>
}) {
  const { fullName, catalogName, run } = card
  const slash = fullName.indexOf("/")
  const ownerRaw = fullName.slice(0, slash)
  const repo = fullName.slice(slash + 1)
  const { owner: ownerPrefix } = repoDisplayLabel(fullName, duplicateRepoNames)

  // Workflow exists but has no runs yet
  if (!run) {
    return (
      <div
        className="latest-run-card"
        style={{ borderLeft: "3px solid var(--color-border)" }}
      >
        <div
          className="latest-run-repo"
          title={fullName}
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {ownerPrefix && <span className="health-repo-label-owner">{ownerPrefix}/</span>}{repo}
        </div>
        <div className="flex-center gap-2" style={{ justifyContent: "space-between", minWidth: 0 }}>
          <span className="latest-run-workflow truncate text-muted">{catalogName}</span>
          <span className="run-dot run-dot-neutral" />
        </div>
        <div className="flex-center gap-1 latest-run-time text-muted text-small">
          No runs yet
        </div>
      </div>
    )
  }

  const isActive = run.status === "in_progress" || run.status === "queued"
  const commitUrl = `https://github.com/${fullName}/commit/${run.headSha}`
  const duration = formatDuration(run.runStartedAt, isActive ? null : run.updatedAt)
  const variant = runStatusVariant(run.status, run.conclusion)
  const color = VARIANT_COLOR[variant]

  return (
    <div
      className="latest-run-card"
      data-active={isActive || undefined}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {/* Repo name — sits above the stretched link, purely informational */}
      <div
        className="latest-run-repo"
        title={fullName}
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {ownerPrefix && <span className="health-repo-label-owner">{ownerPrefix}/</span>}{repo}
      </div>
      <div className="flex-center gap-2" style={{ justifyContent: "space-between", minWidth: 0 }}>
        <Link
          to="/runs/$owner/$repo/$runId"
          params={{ owner: ownerRaw, repo, runId: String(run.id) }}
          className="latest-run-workflow latest-run-card-link truncate"
        >
          {catalogName}
        </Link>
        <RunDot status={run.status} conclusion={run.conclusion} />
      </div>
      <div className="flex-center gap-2 latest-run-meta" style={{ flexWrap: "wrap" }}>
        <a
          href={`https://github.com/${fullName}/tree/${run.headBranch}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mono latest-run-sha flex-center gap-1 latest-run-meta-link"
        >
          <BranchIcon />
          <span className="truncate" style={{ maxWidth: "10ch" }}>{run.headBranch}</span>
        </a>
        <span style={{ opacity: 0.4 }}>·</span>
        <a
          href={commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mono latest-run-sha flex-center gap-1 latest-run-meta-link"
        >
          <CommitIcon />
          {run.headSha.slice(0, 7)}
        </a>
      </div>
      <div className="flex-center gap-1 latest-run-time">
        <ClockIcon />
        {duration}
        <span style={{ opacity: 0.4 }}>·</span>
        {formatRelativeTime(run.runStartedAt ?? run.createdAt)}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the display label for a repo within a set of cards.
 * Normally just the repo short-name; when another card shares that
 * short-name (different owner), prefixes the first 3 chars of the
 * owner followed by "…/" to disambiguate — e.g. "man…/api".
 */
export function repoDisplayLabel(fullName: string, duplicateRepoNames: Set<string>): { owner: string | null; repo: string } {
  const slash = fullName.indexOf("/")
  const owner = fullName.slice(0, slash)
  const repo = fullName.slice(slash + 1)
  if (duplicateRepoNames.has(repo)) {
    return { owner: `${owner.slice(0, 3)}…`, repo }
  }
  return { owner: null, repo }
}

/**
 * Resolve watch workflow names against a set of repository workflow catalogs.
 * Returns one WatchedWorkflowCard per (repo, matched workflow) pair.
 * Matching is case-insensitive exact on the catalog workflow name.
 */
export function resolveWatchedWorkflows(
  watchWorkflows: string[],
  repoCatalogs: Array<{ fullName: string; workflows: Array<{ id: number; name: string }> }>,
): Array<{ fullName: string; workflowId: number; catalogName: string }> {
  const results: Array<{ fullName: string; workflowId: number; catalogName: string }> = []
  for (const { fullName, workflows } of repoCatalogs) {
    for (const wfName of watchWorkflows) {
      const lower = wfName.toLowerCase()
      for (const w of workflows) {
        if (w.name.toLowerCase() === lower) {
          results.push({ fullName, workflowId: w.id, catalogName: w.name })
        }
      }
    }
  }
  return results
}

// ── Icons (inline SVG — same as used elsewhere in the dashboard) ──────────────

function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/>
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>
    </svg>
  )
}

function BranchIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 2.25a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5zM4.25 13.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zM5 15.75a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5zM4.25 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zM5 4.75a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5z"/>
      <path d="M5 6.25v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 1.5 0zm5.06-1.28a.75.75 0 0 1-.78 1.28A3.5 3.5 0 0 0 5.75 9.5v.75a.75.75 0 0 1-1.5 0V9.5a5 5 0 0 1 5.785-4.53z"/>
    </svg>
  )
}

function CommitIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0z"/>
    </svg>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function WorkflowHealthSection({ watchWorkflows, cards, unresolvedNames }: WorkflowHealthSectionProps) {
  if (watchWorkflows.length === 0) return null

  const hasUnresolved = unresolvedNames && unresolvedNames.length > 0

  // Nothing to show at all — no cards and no diagnostics
  if (cards.length === 0 && !hasUnresolved) return null

  // Detect repo short-names that appear under more than one distinct owner
  const repoOwnerMap = new Map<string, Set<string>>()
  for (const { fullName } of cards) {
    const slash = fullName.indexOf("/")
    const owner = fullName.slice(0, slash)
    const repo = fullName.slice(slash + 1)
    if (!repoOwnerMap.has(repo)) repoOwnerMap.set(repo, new Set())
    repoOwnerMap.get(repo)!.add(owner)
  }
  const duplicateRepoNames = new Set(
    [...repoOwnerMap.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([repo]) => repo)
  )

  return (
    <Card>
      <div className="card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.2rem" }}>
        <span className="card-title">Workflow Health</span>
        <TruncatingTitle items={watchWorkflows} className="text-muted text-small" />
      </div>
      {cards.length > 0 && (
        <div className="latest-runs-grid">
          {cards.map((card) => (
            <HealthRunCard
              key={`${card.fullName}/${card.workflowId}`}
              card={card}
              duplicateRepoNames={duplicateRepoNames}
            />
          ))}
        </div>
      )}
      {hasUnresolved && (
        <div className="text-muted text-small" style={{ padding: "0.5rem 0.75rem" }} data-testid="unresolved-names">
          {unresolvedNames.map((name) => (
            <div key={name}>No matching workflow found for <strong>{name}</strong></div>
          ))}
        </div>
      )}
    </Card>
  )
}
