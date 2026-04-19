import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { getRepo, getRepoScore, getWorkflows, getRuns } from "../../api/index.js"
import { StatusBadge, TierBadge } from "../../components/ui/Badge.js"
import { Button } from "../../components/ui/Button.js"
import { Card, CardHeader } from "../../components/ui/Card.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { BuildTrendChart, DurationChart } from "../../components/charts/RunCharts.js"
import { EventBadge } from "../../components/ui/EventBadge.js"
import { formatRelativeTime, formatDuration, formatDateTime } from "../../lib/utils.js"
import type { RepositoryScore, WorkflowRun } from "../../types/index.js"

export const Route = createFileRoute("/_app/repositories/$owner/$repo")({
  component: RepositoryDetail,
})

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Returns the sorted unique trigger events seen per workflow (from recent runs). */
export function triggersFromRuns(runs: WorkflowRun[]): Map<number, string[]> {
  const map = new Map<number, Set<string>>()
  for (const run of runs) {
    if (!map.has(run.workflowId)) map.set(run.workflowId, new Set())
    map.get(run.workflowId)!.add(run.event)
  }
  return new Map([...map.entries()].map(([id, events]) => [id, [...events].sort()]))
}

// ── Route component ───────────────────────────────────────────────────────────

function RepositoryDetail() {
  const { owner, repo } = Route.useParams()

  const { data: repoData, isLoading: repoLoading } = useQuery({
    queryKey: ["repo", owner, repo],
    queryFn: () => getRepo(owner, repo),
  })

  if (repoLoading) return <PageSpinner />
  if (!repoData) return <p className="empty-state">Repository not found.</p>

  return (
    <div>
      <div className="page-header">
        <span className="health-repo-label-owner">{owner}/</span>
        <span style={{ fontWeight: 600 }}>{repo}</span>
      </div>

      <div className="stack">
        <WorkflowsCard owner={owner} repo={repo} />
        <BuildChartsCard owner={owner} repo={repo} />
        <RecentRunsCard owner={owner} repo={repo} />
        <ScoreCard owner={owner} repo={repo} />
      </div>
    </div>
  )
}

function ScoreCard({ owner, repo }: { owner: string; repo: string }) {
  const { data: score, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["score", owner, repo],
    queryFn: () => getRepoScore(owner, repo),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  })

  return (
    <Card>
      <CardHeader
        title="Repository Score"
        actions={
          <Button size="sm" loading={isFetching} onClick={() => void refetch()}>
            Refresh score
          </Button>
        }
      />
      {isLoading ? (
        <PageSpinner />
      ) : score ? (
        <ScoreDisplay score={score} />
      ) : (
        <p className="text-muted text-small">Score unavailable.</p>
      )}
    </Card>
  )
}

function ScoreDisplay({ score }: { score: RepositoryScore }) {
  return (
    <div>
      <div className="flex-center gap-3" style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: 36, fontWeight: 700 }}>{score.overall}</div>
        <div>
          <TierBadge tier={score.tier} score={score.overall} />
          <div className="text-muted text-small" style={{ marginTop: "0.25rem" }}>
            Scored {formatRelativeTime(score.computedAt)}
          </div>
        </div>
      </div>
      <div className="score-grid">
        {score.categories.filter((cat) =>
          cat.name !== "Community Health" && cat.name !== "Branch Protection"
        ).map((cat) => (
          <div key={cat.name} className="score-category">
            <div className="score-category-name">
              {cat.name} — {cat.score}/100
            </div>
            <div className="score-category-bar">
              <div
                className="score-category-fill"
                style={{
                  width: `${cat.score}%`,
                  background:
                    cat.score >= 90
                      ? "var(--color-success)"
                      : cat.score >= 70
                      ? "var(--color-running)"
                      : "var(--color-failure)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkflowsCard({ owner, repo }: { owner: string; repo: string }) {
  const { data: workflows } = useQuery({
    queryKey: ["workflows", owner, repo],
    queryFn: () => getWorkflows(owner, repo),
    staleTime: 10 * 60 * 1000,
  })

  // Reuse the charts-runs cache (shared with BuildChartsCard) to derive triggers —
  // no extra network request needed.
  const { data: runsData } = useQuery({
    queryKey: ["runs", `${owner}/${repo}`, "charts"],
    queryFn: () => getRuns(owner, repo, { per_page: 100 }),
    staleTime: 2 * 60 * 1000,
  })

  const triggerMap = triggersFromRuns(runsData?.runs ?? [])

  return (
    <Card>
      <CardHeader title={`Workflows (${workflows?.length ?? "…"})`} />
      {!workflows || workflows.length === 0 ? (
        <p className="empty-state">No workflows found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Path</th>
                <th>Triggers</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => {
                const triggers = triggerMap.get(w.id) ?? []
                return (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 500 }}>
                      <a href={w.htmlUrl} target="_blank" rel="noopener noreferrer">
                        {w.name}
                      </a>
                    </td>
                    <td className="mono text-small text-muted">{w.path}</td>
                    <td>
                      {triggers.length > 0 ? (
                        <span className="flex-center gap-1" style={{ flexWrap: "wrap" }}>
                          {triggers.map((t) => <EventBadge key={t} event={t} />)}
                        </span>
                      ) : (
                        <span className="text-muted text-small">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${w.state === "active" ? "badge-success" : "badge-neutral"}`}>
                        {w.state}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function BuildChartsCard({ owner, repo }: { owner: string; repo: string }) {
  const { data: runsData } = useQuery({
    queryKey: ["runs", `${owner}/${repo}`, "charts"],
    queryFn: () => getRuns(owner, repo, { per_page: 100 }),
    staleTime: 2 * 60 * 1000,
  })

  const runs = runsData?.runs ?? []

  return (
    <Card>
      <CardHeader title="Build Trends" />
      <div className="chart-row">
        <div className="chart-section">
          <div className="chart-label">Run outcomes — last 14 days</div>
          <BuildTrendChart runs={runs} />
        </div>
        <div className="chart-section">
          <div className="chart-label">Run duration — last 40 completed</div>
          <DurationChart runs={runs} />
        </div>
      </div>
    </Card>
  )
}

export function RecentRunsCard({ owner, repo }: { owner: string; repo: string }) {
  const { data: runsData } = useQuery({
    queryKey: ["runs", `${owner}/${repo}`, "recent"],
    queryFn: () => getRuns(owner, repo, { per_page: 25 }),
    refetchInterval: 30_000,
  })

  const runs = runsData?.runs ?? []

  return (
    <Card>
      <CardHeader
        title="Recent Runs"
        actions={
          <Link
            to="/repositories/$owner/$repo/runs"
            params={{ owner, repo }}
            className="btn btn-sm"
          >
            View all
          </Link>
        }
      />
      {runs.length === 0 ? (
        <p className="empty-state">No runs found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Branch / Commit</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link
                      to="/runs/$owner/$repo/$runId"
                      params={{ owner, repo, runId: String(run.id) }}
                      style={{ fontWeight: 500 }}
                    >
                      {run.displayTitle}
                    </Link>
                    {run.runAttempt > 1 && (
                      <span className="badge badge-neutral" style={{ marginLeft: "0.375rem", fontSize: 10 }}>
                        ×{run.runAttempt}
                      </span>
                    )}
                  </td>
                  <td>
                    <div>
                      <a
                        href={`https://github.com/${owner}/${repo}/tree/${run.headBranch}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-small"
                      >
                        {run.headBranch}
                      </a>
                    </div>
                    <a
                      href={`https://github.com/${owner}/${repo}/commit/${run.headSha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono text-small text-muted"
                      title={run.headSha}
                    >
                      {run.headSha.slice(0, 7)}
                    </a>
                  </td>
                  <td>
                    <EventBadge event={run.event} />
                  </td>
                  <td className="text-small text-muted">
                    {run.actor?.login ?? "—"}
                  </td>
                  <td>
                    <StatusBadge status={run.status} conclusion={run.conclusion} />
                  </td>
                  <td className="text-muted text-small">
                    {formatDuration(run.runStartedAt, run.updatedAt)}
                  </td>
                  <td className="text-muted text-small" title={formatDateTime(run.runStartedAt ?? run.createdAt)}>
                    {formatRelativeTime(run.runStartedAt ?? run.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
