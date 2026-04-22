import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { getRepos, getRuns } from "../../api/index.js"
import { StatusBadge } from "../../components/ui/Badge.js"
import { Card, CardHeader } from "../../components/ui/Card.js"
import { PageSpinner } from "../../components/ui/Spinner.js"
import { SuccessSquares } from "../../components/ui/SuccessSquares.js"
import { formatRelativeTime } from "../../lib/utils.js"

export const Route = createFileRoute("/_app/repositories")({
  component: Repositories,
})

function Repositories() {
  const matches = useMatches()
  const hasChild = matches.some(
    (m) => m.routeId !== "/_app/repositories" && m.routeId.startsWith("/_app/repositories/")
  )

  const [filter, setFilter] = useState("")

  const { data: repos, isLoading } = useQuery({
    queryKey: ["repos", "user"],
    queryFn: () => getRepos(),
    staleTime: 15 * 60 * 1000,
    enabled: !hasChild,
  })

  if (hasChild) return <Outlet />
  if (isLoading) return <PageSpinner />

  if (!repos || repos.length === 0) {
    return <p className="empty-state">No repositories found.</p>
  }

  const q = filter.toLowerCase()
  const visibleRepos = q
    ? repos.filter((r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false) ||
        (r.language?.toLowerCase().includes(q) ?? false) ||
        r.topics.some((t) => t.toLowerCase().includes(q))
      )
    : repos

  const title = q
    ? `Repositories (${visibleRepos.length} of ${repos.length})`
    : `Repositories (${repos.length})`

  return (
    <div>
      <Card>
        <CardHeader title={title} />
        <div style={{ marginBottom: "0.75rem" }}>
          <input
            type="search"
            placeholder="Search here..."
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
        {visibleRepos.length === 0 ? (
          <p className="empty-state">No repositories match "{filter}".</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Language</th>
                  <th>Last push</th>
                  <th>Last run</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {visibleRepos.map((repo) => {
                  const [owner, name] = repo.fullName.split("/")
                  return (
                    <RepoRow
                      key={repo.id}
                      owner={owner!}
                      name={name!}
                      repo={repo}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function RepoRow({
  owner,
  name,
  repo,
}: {
  owner: string
  name: string
  repo: { fullName: string; language: string | null; pushedAt: string | null }
}) {
  const { data: runsData } = useQuery({
    queryKey: ["runs", `${owner}/${name}`, "recent"],
    queryFn: () => getRuns(owner, name, { per_page: 10 }),
    staleTime: 2 * 60 * 1000,
  })

  const runs = runsData?.runs ?? []
  const actionsDisabled = runsData?.actionsDisabled ?? false
  const lastRun = runs[0]

  return (
    <tr>
      <td className="text-small" style={{ whiteSpace: "nowrap" }}>
        <span className="health-repo-label-owner">{owner}/</span>
        <Link to="/repositories/$owner/$repo" params={{ owner, repo: name }} style={{ fontWeight: 500 }}>
          {name}
        </Link>
      </td>
      <td className="text-muted text-small">{repo.language ?? "—"}</td>
      <td className="text-muted text-small">{formatRelativeTime(repo.pushedAt)}</td>
      <td>
        {lastRun ? (
          <span className="flex-center gap-2">
            <StatusBadge status={lastRun.status} conclusion={lastRun.conclusion} />
            <span className="text-muted text-small">{formatRelativeTime(lastRun.createdAt)}</span>
          </span>
        ) : (
          <span className="text-muted text-small">
            {actionsDisabled ? "Actions not enabled" : "No runs"}
          </span>
        )}
      </td>
      <td><SuccessSquares runs={runs} /></td>
    </tr>
  )
}
