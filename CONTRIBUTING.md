# Contributing

Thanks for your interest in contributing to Dashlight.

## Prerequisites

- **Node.js 22** — matches the Docker runtime
- **pnpm 10** — `npm install -g pnpm` or via [corepack](https://nodejs.org/api/corepack.html)
- **Docker + Docker Compose** — for running the full stack locally
- A **GitHub OAuth App** — see the [setup guide](README.md#setup) in the README

## Local development setup

```bash
git clone https://github.com/your-username/dashlight.git
cd dashlight
pnpm install          # installs deps and sets up git hooks (husky)
cp env.example .env   # fill in GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET
pnpm dev              # starts server (localhost:8080) and web (localhost:5174) in watch mode
```

The Vite dev server proxies `/auth`, `/api`, `/proxy`, and `/system` to the server automatically — no CORS setup needed.

## Project layout

```
packages/
  server/   — Hono TypeScript server (Node 22)
  web/      — React 19 frontend (TanStack Router + React Query)
```

## Making changes

1. **Fork** the repo and create a branch from `develop` (not `main`)
2. Make your changes
3. Add or update tests — coverage thresholds are enforced
4. Run the full check suite:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These also run automatically on `git commit` via the pre-commit hook.

## Submitting a pull request

- Target the `develop` branch, not `main`
- Keep PRs focused — one feature or fix per PR
- Describe what changed and why in the PR description
- Link any related issues

CI runs lint, typecheck, tests, and build on every PR. All checks must pass before a PR can be merged.

## Reporting bugs

Use the [bug report template](https://github.com/your-username/dashlight/issues/new?template=bug_report.yml).

## Suggesting features

Use the [feature request template](https://github.com/your-username/dashlight/issues/new?template=feature_request.yml).
