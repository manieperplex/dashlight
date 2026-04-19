import type { RunStatus, RunConclusion, ScoreTier } from "../../types/index.js"
import { runStatusVariant, runStatusLabel, tierLabel } from "../../lib/utils.js"
import type { StatusVariant } from "../../lib/utils.js"

interface BadgeProps {
  children: React.ReactNode
  variant?: StatusVariant | "neutral"
  className?: string
}

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return <span className={`badge badge-${variant} ${className ?? ""}`}>{children}</span>
}

interface StatusBadgeProps {
  status: RunStatus
  conclusion: RunConclusion
}

export function StatusBadge({ status, conclusion }: StatusBadgeProps) {
  const variant = runStatusVariant(status, conclusion)
  const label = runStatusLabel(status, conclusion)

  const dot =
    variant === "running" ? (
      <span className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} />
    ) : (
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "currentColor",
          opacity: 0.6,
        }}
      />
    )

  return (
    <Badge variant={variant}>
      {dot}
      {label}
    </Badge>
  )
}

interface TierBadgeProps {
  tier: ScoreTier
  score: number
}

export function TierBadge({ tier, score }: TierBadgeProps) {
  return (
    <span className={`badge badge-${tier}`}>
      {tierLabel(tier)} · {score}
    </span>
  )
}
