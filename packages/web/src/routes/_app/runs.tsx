import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueries } from "@tanstack/react-query"
import { z } from "zod"
import { getRepos, getRuns } from "../../api/index.js"
import { StatusBadge } from "../../components/ui/Badge.js"
import { Card, CardHeader } from "../../components/ui/Card.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { EventBadge } from "../../components/ui/EventBadge.js"
import { formatRelativeTime, formatDuration, formatDateTime } from "../../lib/utils.js"
import type { WorkflowRun } from "../../types/index.js"

const searchSchema = z.object({
  filter: z.string().optional(),
})

export const Route = createFileRoute("/_app/runs")({
  validateSearch: searchSchema,
  component: AllRuns,
})

// ── Pure helpers ───────────────────────────────────────────────────────────────

export interface RunWithRepo {
  run: WorkflowRun
  owner: string
  repo: string
}

/** Flattens per-repo run arrays and sorts newest first. */
export function mergeAndSortRuns(perRepo: RunWithRepo[][]): RunWithRepo[] {
  return perRepo
    .flat()
    .sort((a, b) => new Date(b.run.createdAt).getTime() - new Date(a.run.createdAt).getTime())
}

/** Case-insensitive filter across repo, title, branch and actor. */
export function filterRuns(runs: RunWithRepo[], query: string): RunWithRepo[] {
  const q = query.toLowerCase()
  return runs.filter(({ run, owner, repo }) =>
    `${owner}/${repo}`.includes(q) ||
    run.displayTitle.toLowerCase().includes(q) ||
    run.headBranch.toLowerCase().includes(q) ||
    (run.actor?.login.toLowerCase().includes(q) ?? false)
  )
}

// ── Route component ───────────────────────────────────────────────────────────

function AllRuns() {
  const { filter = "" } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: ["repos", "user"],
    queryFn: () => getRepos(),
    staleTime: 15 * 60 * 1000,
  })

  const repoList = repos ?? []

  const runResults = useQueries({
    queries: repoList.map((r) => {
      const [owner, name] = r.fullName.split("/")
      return {
        queryKey: ["runs", r.fullName, "all-runs"] as const,
        queryFn: () => getRuns(owner!, name!, { per_page: 25 }),
        staleTime: 30 * 1000,
        refetchInterval: 30_000,
        enabled: !!owner && !!name,
      }
    }),
  })

  if (reposLoading) return <PageSpinner />

  const perRepo: RunWithRepo[][] = repoList.map((repo, i) => {
    const [owner, name] = repo.fullName.split("/")
    return (runResults[i]?.data?.runs ?? []).map((run) => ({
      run,
      owner: owner!,
      repo: name!,
    }))
  })

  const sortedRuns = mergeAndSortRuns(perRepo)
  const visibleRuns = filter ? filterRuns(sortedRuns, filter) : sortedRuns
  const isFiltered = filter.length > 0

  const title = isFiltered
    ? `All Runs (${visibleRuns.length} of ${sortedRuns.length})`
    : `All Runs (${sortedRuns.length})`

  function setFilter(value: string) {
    void navigate({ search: value ? { filter: value } : {} })
  }

  return (
    <div>
      <Card>
        <CardHeader title={title} />
        <div style={{ marginBottom: "0.75rem" }}>
          <input
            type="search"
            placeholder="Filter by repo, title, branch or actor…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "0.3125rem 0.625rem",
              fontSize: 13,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
        </div>
        {visibleRuns.length === 0 ? (
          <p className="empty-state">
            {isFiltered ? `No runs match "${filter}".` : "No runs found."}
          </p>
        ) : (
          <AllRunsTable runs={visibleRuns} />
        )}
      </Card>
    </div>
  )
}

// ── Presentational table ───────────────────────────────────────────────────────

export function AllRunsTable({ runs }: { runs: RunWithRepo[] }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Repository</th>
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
          {runs.map(({ run, owner, repo }) => (
            <tr key={run.id}>
              <td className="text-small" style={{ whiteSpace: "nowrap" }}>
                <span className="health-repo-label-owner">{owner}/</span>
                <Link
                  to="/repositories/$owner/$repo"
                  params={{ owner, repo }}
                  style={{ fontWeight: 500 }}
                >
                  {repo}
                </Link>
              </td>
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
  )
}
