# Changelog

## [1.0.0-rc.1] — 2026-04-20

First public release candidate of Dashlight — a lightweight, self-hosted CI/CD dashboard for GitHub Actions.

### Features

#### Dashboard
- Repository health overview table with expandable workflows, per-repo success rate (last 100 runs), in-progress counts, and latest run cards
- Build activity chart (stacked area, last 30 days) and per-repository trend mini-charts
- Aggregate run statistics: total runs, succeeded, failed, cancelled, total duration

#### Repositories
- Repository list with search/filter by name, description, language, or topics
- Per-repo language, last push time, last run status, and health score tier (Gold / Silver / Bronze)
- Repository detail page with workflow cards, build trend charts, run history, and a weighted health score across 7 categories (CI/CD, build success rate, security practices, documentation, maintenance, community health, branch protection)

#### Runs
- Global runs list across all repositories with filter by repo, title, branch, or actor
- Repository-scoped runs list with pagination
- Run detail page with status summary, commit metadata, artifact downloads, re-run and cancel actions
- Job list with per-step status, duration, and runner information
- Job log viewer with step-level breakdown
- Job dependency graph (DAG) visualizing execution order and parallelism

#### Authentication
- GitHub OAuth 2.0 login with PKCE (RFC 7636) and CSRF state token validation
- HttpOnly signed JWT session cookies — access token never sent to the browser
- Scopes: `repo`, `read:org`, `read:user`, `user:email` (public-only mode supported)

#### Server & API
- Hono-based proxy server at `/proxy/*` forwarding to GitHub REST API
- ETag-based conditional revalidation (304 Not Modified) to minimize API quota usage
- In-flight request coalescing to prevent thundering herd on cache misses
- Write deduplication for mutating requests
- Smart TTL routing by data type (2 min for active runs → 7 days for completed logs)
- Repository list endpoint supporting explicit repo list, organization scope, or authenticated user repos
- Repository health score endpoint with on-demand refresh
- `/system/health` health check endpoint

#### Caching
- Four-layer cache architecture:
  - **L1** — TanStack Query in-memory cache with per-query stale times
  - **L2** — IndexedDB persistence (24 h TTL, survives page reloads)
  - **L3** — Server-side per-user LRU cache (configurable size, default 128 MB)
  - **L4** — ETag stale store enabling zero-quota revalidation (24 h TTL)
- Auto-refetch intervals: 10 s for active runs, 30 s for run lists, 60 s for dashboard summaries

#### Infrastructure
- Docker Compose setup with nginx reverse proxy and Node.js server — no external database required
- Environment-based configuration: OAuth credentials, session secret, optional org/repo filtering, proxy and CA certificate support
- CI pipeline: lint, typecheck, unit tests, Docker build on every PR and push to `develop`
- Release pipeline on `main`: automatic version bump, changelog generation, GitHub Release creation (Conventional Commits)
