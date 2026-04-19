import type { RunStatus, RunConclusion } from "../../types/index.js"

const MAX_SQUARES = 30
const SPARSE_THRESHOLD = 5

type RunLike = { status: RunStatus; conclusion: RunConclusion }

function squareColor(run: RunLike): string {
  if (run.conclusion === "success") return "var(--color-success)"
  if (run.conclusion === "failure" || run.conclusion === "timed_out") return "var(--color-failure)"
  if (run.conclusion === "cancelled") return "var(--color-cancelled)"
  if (run.status === "in_progress" || run.status === "queued") return "var(--color-running)"
  return "var(--color-neutral)"
}

interface SuccessSquaresProps {
  runs: RunLike[]
  muted?: boolean
}

export function SuccessSquares({ runs, muted }: SuccessSquaresProps) {
  if (runs.length === 0) return <span className="text-muted">—</span>

  const completed = runs.filter((r) => r.status === "completed")
  const success = completed.filter((r) => r.conclusion === "success").length
  const pct = completed.length > 0 ? Math.round((success / completed.length) * 100) : 0
  const sparse = runs.length < SPARSE_THRESHOLD

  // Oldest → newest left to right (runs[0] is newest)
  const squares = runs.slice(0, MAX_SQUARES).reverse()

  return (
    <div
      className="success-squares-wrapper"
      title={sparse ? `Only ${runs.length} run${runs.length !== 1 ? "s" : ""} in sampled window — rate may not be representative` : undefined}
    >
      <div className="success-squares" style={{ opacity: muted ? 0.45 : 1 }}>
        {squares.map((run, i) => (
          <span
            key={i}
            className="success-square"
            style={{ background: squareColor(run) }}
            title={run.conclusion ?? run.status}
          />
        ))}
      </div>
      <span className="text-muted" style={{ fontSize: 11 }}>{pct}%</span>
      {sparse && (
        <span className="success-squares-sparse" title={undefined}>
          {runs.length}
        </span>
      )}
    </div>
  )
}
