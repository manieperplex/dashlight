import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { getRuns } from "../../api/index.js"
import { StatusBadge } from "../../components/ui/Badge.js"
import { Button } from "../../components/ui/Button.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { EventBadge } from "../../components/ui/EventBadge.js"
import { formatRelativeTime, formatDuration, formatDateTime } from "../../lib/utils.js"

const searchSchema = z.object({
  branch: z.string().optional(),
  status: z.string().optional(),
  page: z.number().optional().default(1),
})

export const Route = createFileRoute("/_app/repositories/$owner/$repo/runs")({
  validateSearch: searchSchema,
  component: RunsList,
})

function RunsList() {
  const { owner, repo } = Route.useParams()
  const { branch, status, page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const { data, isLoading } = useQuery({
    queryKey: ["runs", `${owner}/${repo}`, { branch, status, page }],
    queryFn: () => getRuns(owner, repo, { branch, status, page, per_page: 30 }),
    refetchInterval: 30_000,
  })

  function setSearch(updates: Partial<z.infer<typeof searchSchema>>) {
    void navigate({ search: (prev) => ({ ...prev, ...updates, page: 1 }) })
  }

  if (isLoading) return <PageSpinner />

  const runs = data?.runs ?? []
  const totalPages = Math.ceil((data?.total ?? 0) / 30)

  return (
    <div>
      <div className="page-header">
        <div className="flex-center gap-2" style={{ marginBottom: "0.25rem" }}>
          <Link to="/repositories" className="text-muted text-small">Repositories</Link>
          <span className="text-muted text-small">/</span>
          <Link
            to="/repositories/$owner/$repo"
            params={{ owner, repo }}
            className="text-muted text-small"
          >
            {owner}/{repo}
          </Link>
          <span className="text-muted text-small">/</span>
          <span>Runs</span>
        </div>
      </div>

      <div className="flex-center gap-2" style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Filter by branch…"
          value={branch ?? ""}
          onChange={(e) => setSearch({ branch: e.target.value || undefined })}
          style={{
            padding: "0.25rem 0.5rem", borderRadius: "var(--radius)",
            border: "1px solid var(--color-border)", background: "var(--color-bg)",
            color: "var(--color-text)", fontSize: 13,
          }}
        />
        <select
          value={status ?? ""}
          onChange={(e) => setSearch({ status: e.target.value || undefined })}
          style={{
            padding: "0.25rem 0.5rem", borderRadius: "var(--radius)",
            border: "1px solid var(--color-border)", background: "var(--color-bg)",
            color: "var(--color-text)", fontSize: 13,
          }}
        >
          <option value="">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="queued">Queued</option>
          <option value="completed">Completed</option>
          <option value="failure">Failed</option>
          <option value="success">Success</option>
        </select>
      </div>

      <div className="card">
        {runs.length === 0 ? (
          <p className="empty-state">No runs found.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
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
                    <td className="text-muted text-small mono">{run.runNumber}</td>
                    <td>
                      <Link
                        to="/runs/$owner/$repo/$runId"
                        params={{ owner, repo, runId: String(run.id) }}
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
                      {formatRelativeTime(run.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex-center gap-2" style={{ padding: "0.75rem", borderTop: "1px solid var(--color-border)" }}>
            <Button
              size="sm"
              disabled={(page ?? 1) <= 1}
              onClick={() => setSearch({ page: (page ?? 1) - 1 })}
            >
              ← Prev
            </Button>
            <span className="text-muted text-small">
              Page {page ?? 1} of {totalPages}
            </span>
            <Button
              size="sm"
              disabled={(page ?? 1) >= totalPages}
              onClick={() => setSearch({ page: (page ?? 1) + 1 })}
            >
              Next →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
