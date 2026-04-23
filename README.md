# Dashlight

A self-hosted GitHub Actions dashboard. See workflow runs, job status, and per-repository health scores across personal and organisation repos in one view. Filter by branch or status, drill into job logs, and track run trends over time. Sign in with your own GitHub account (OAuth) or share a single Personal Access Token across your team (PAT mode, optionally password-protected).

**No database. Two Docker containers. Your GitHub token never touches the browser.**

<br>

![Dashlight dashboard](.github/assets/dashlight.png)

## How it works

- **OAuth mode** (default): each user signs in with their own GitHub account. The server exchanges the code for a per-user token and keeps it in memory — only an opaque session cookie reaches the browser.
- **PAT mode** (alternative): a single shared GitHub Personal Access Token is set as `GITHUB_TOKEN`. No OAuth app is needed. All users access the dashboard through the same token, optionally protected by an app-level password (`APP_PASSWORD`).
- All GitHub API calls go through the server proxy, which caches responses in an LRU store (2 min for runs, 7 days for immutable data).
- The React frontend caches query results in IndexedDB so data survives page reloads.
- Polling replaces WebSockets: active pipelines refresh every 30 s, summaries every 60 s.

---

## Requirements

- Docker + Docker Compose
- A GitHub account with access to the repositories you want to monitor
- Either: a GitHub OAuth App **or** a classic Personal Access Token (PAT)

---

## Setup

Choose the authentication mode that fits your deployment. **PAT mode** is simpler — no OAuth app registration needed. **OAuth mode** gives each user their own GitHub identity and a separate API rate limit budget.

### Option A — PAT mode (simpler, shared token)

A single classic PAT (`ghp_…`) is used for all GitHub API calls. No GitHub OAuth App is required.

**1. Create a classic PAT**

Go to [github.com/settings/tokens](https://github.com/settings/tokens) → Generate new token (classic).

Select scopes based on what you need to monitor:

| Your setup | Minimum scopes |
|---|---|
| Personal private repos | `repo` |
| Personal public repos — read only, no re-run/cancel | `public_repo` |
| Personal public repos — including re-run/cancel | `repo` |
| Organisation repos (via `GITHUB_ORG` or `GITHUB_REPOS`) | `repo` |
| Organisation repos on orgs with restricted internal visibility | `repo`, `read:org` |

**Scope reference**

| Scope | What it covers in Dashlight |
|---|---|
| `repo` | Read and list private + public repos; read workflow runs; re-run and cancel jobs; read your own basic profile (`login`, `name`, `avatar`) via `GET /user`. **This is the recommended default.** |
| `public_repo` | Same as above but for public repos only. Re-run and cancel are not available with this scope alone — GitHub requires `repo` for write operations even on public repos. |
| `read:org` | List repos via `/orgs/:org/repos` when the organisation has set internal repo visibility to "private members only". For standard organisations with member access, `repo` alone is sufficient. |

> **Note on `repo` granting write access:** `repo` is GitHub's all-or-nothing scope for private repositories — read and write are bundled. There is no narrower scope that covers private repo access. The write operations Dashlight performs are: triggering workflow reruns and cancelling in-progress runs, both only when initiated by the user through the UI. No code, settings, or repository content is ever modified.

Copy the generated token (`ghp_…`).

**2. Clone and configure**

```bash
git clone <repo-url> dashlight
cd dashlight
cp env.example .env
```

Edit `.env` with the token. `SESSION_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` are not required in PAT+open mode:

```env
GITHUB_TOKEN=ghp_your_classic_pat_here
```

To require a password before users can access the dashboard (optional):

```env
GITHUB_TOKEN=ghp_your_classic_pat_here
APP_PASSWORD=a-strong-shared-password
SESSION_SECRET=a-random-string-of-at-least-32-characters
```

Generate a session secret when using `APP_PASSWORD`:

```bash
openssl rand -base64 32
```

> **Rate limits in PAT mode:** GitHub's API limit is 5 000 requests/hour per token. In PAT mode all users share this one pool. Dashlight caches aggressively (2 min for run lists, longer for immutable data), so in practice a team of up to ~20 concurrent users is comfortable. For larger teams or high-frequency polling, consider OAuth mode instead, where each user gets their own 5 000 req/hr budget.

**3. Build and start**

```bash
docker compose up --build
```

Open `http://localhost:5174`. No sign-in required if `APP_PASSWORD` is not set; a password prompt appears if it is.

---

### Option B — OAuth mode (per-user accounts)

Each user signs in with their own GitHub account. The server exchanges the OAuth code for a per-user token — no token is ever shared.

**1. Create a GitHub OAuth App**

Go to [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App.

| Field | Value |
|---|---|
| Application name | Dashlight (or anything) |
| Homepage URL | `http://your-host:5174` |
| Authorization callback URL | `http://your-host:5174/auth/callback` |

Copy the **Client ID** and generate a **Client Secret**.

**2. Clone and configure**

```bash
git clone <repo-url> dashlight
cd dashlight
cp env.example .env
```

Edit `.env` and fill in the three required values:

```env
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
SESSION_SECRET=a-random-string-of-at-least-32-characters
```

Generate a session secret:

```bash
openssl rand -base64 32
```

**3. (Optional) Scope repositories**

By default all repos the authenticated user can access are shown. To restrict:

```env
# Show only repos in one org
GITHUB_ORG=my-company

# Or show only specific repos (takes precedence over GITHUB_ORG)
GITHUB_REPOS=my-company/api,my-company/web
```

**3b. (Optional) Private npm registry via `.npmrc`**

If your organization uses a private npm registry (for example Artifactory, Nexus, or GitHub Packages), configure a project-level `.npmrc` in the repository root.

Use placeholder values like this and replace with your own internal settings:

```ini
registry=https://registry.example.internal/api/npm/npm-virtual/
always-auth=true
//registry.example.internal/api/npm/npm-virtual/:_auth=<base64_of_username_colon_token>
//registry.example.internal/api/npm/npm-virtual/:email=devnull@example.internal
```

Notes:

- Keep the host/path in auth lines exactly aligned with the `registry=` URL path.
- Prefer a dedicated robot/service account token with least required permissions.
- Do not commit real credentials. Keep real auth values in local-only files or CI secrets.

If your registry uses a private CA, also follow [Corporate CA certificate](#corporate-ca-certificate) so Docker build stages can trust TLS during `pnpm install`.

**4. Build and start**

```bash
docker compose up --build
```

First build takes a few minutes (installs dependencies, compiles TypeScript, builds the React SPA). Subsequent starts are fast.

Open `http://localhost:5174` and sign in with GitHub.

**5. Run in the background**

```bash
docker compose up -d --build
docker compose logs -f          # follow logs
docker compose down             # stop
```

**Updating to a new version**

```bash
git pull
docker compose up --build -d
```

---

## Configuration

All variables are set in `.env` (copy from `env.example`).

### Authentication

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | — | **PAT mode.** Classic PAT (`ghp_…`). Required scope: `repo`. Add `read:org` when `GITHUB_ORG` is set. When set, OAuth vars (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`) are ignored. |
| `APP_PASSWORD` | — | **PAT mode, optional.** Shared password shown at the login page. When not set the dashboard is open to anyone who can reach the server. Requires `SESSION_SECRET`. |
| `GITHUB_CLIENT_ID` | — | **OAuth mode.** OAuth App client ID. Required when `GITHUB_TOKEN` is not set. |
| `GITHUB_CLIENT_SECRET` | — | **OAuth mode.** OAuth App client secret. Required when `GITHUB_TOKEN` is not set. |
| `SESSION_SECRET` | — | JWT signing secret, minimum 32 characters, random. Required in OAuth mode and in PAT+password mode. |

### General

| Variable | Default | Description |
|---|---|---|
| `GITHUB_ORG` | — | Show only repos in this org |
| `GITHUB_REPOS` | — | Show only these repos (comma-separated `owner/repo`). Takes precedence over `GITHUB_ORG` |
| `GITHUB_SCOPE` | — | OAuth scopes to request (leave blank for the built-in default). Ignored in PAT mode. |
| `WEB_PORT` | `5174` | Host port for the nginx container |
| `FRONTEND_URL` | `http://localhost:5174` | Public URL of the app — must match where users open it |
| `PORT` | `8080` | Internal server listen port (not exposed publicly) |
| `LOG_LEVEL` | `info` | Server log verbosity: `debug` \| `info` \| `warn` \| `error` |
| `CACHE_MAX_SIZE_MB` | `128` | In-memory LRU cache limit |
| `EXTRA_CA_CERTS_B64` | — | Build-time only. Base64-encoded PEM bundle injected into the image during `docker compose build`. See [Corporate CA certificate](#corporate-ca-certificate). |
| `HTTPS_PROXY` / `HTTP_PROXY` | — | Corporate HTTP proxy for outbound requests to `api.github.com` |
| `NO_PROXY` | — | Comma-separated hosts to bypass the proxy |
| `TRUST_PROXY` | `true` | Trust `X-Forwarded-For` from nginx for rate limiting (set by Compose automatically) |
| `COOKIE_SECURE` | `false` | Set to `true` when serving over HTTPS to enable the `Secure` cookie flag |

### GitHub OAuth scopes

When a user signs in, Dashlight requests these OAuth scopes:

| Scope | Why it is needed |
|---|---|
| `repo` | Read private + public repos; read and manage workflow runs (re-run, cancel). Covers both personal and org repos the user has access to. `repo` is GitHub's minimum scope for any private repo access — there is no narrower read-only alternative. |
| `read:org` | List org repos via `GITHUB_ORG` and read org membership. Also needed when listing repos in an org with restricted internal visibility. |
| `read:user` | Read the signed-in user's basic profile (name, avatar) shown in the UI. |
| `user:email` | Read the account email address. |

The only write operations Dashlight performs are triggering workflow reruns and cancelling in-progress runs — both only when the user explicitly initiates them through the UI. No code, settings, or repository content is ever modified.

**Public-only installation (no private repos)**

If you only monitor public repositories, you can replace `repo` with the narrower `public_repo`:

```env
GITHUB_SCOPE=read:user,user:email,read:org,public_repo
```

Note: re-run and cancel still require `repo` — GitHub does not allow write operations with `public_repo` alone.

**Organisation repos and SAML SSO**

`GITHUB_REPOS=myorg/repo1,myorg/repo2` works for organisation repos without `read:org` — the `repo` scope covers personal and org repos the user has access to. `GITHUB_ORG=myorg` works the same way for standard orgs.

If the organisation enforces SAML SSO, the user must additionally click **Authorize** next to the org name on GitHub's OAuth authorization screen. Without this, GitHub returns 403 for all org resources regardless of granted scopes. There is no server-side workaround — it must be done by each user at login time.

### Changing the port

Set `WEB_PORT` and update `FRONTEND_URL` to match:

```env
WEB_PORT=8443
FRONTEND_URL=http://your-server:8443
```

Also update the GitHub OAuth App callback URL to `http://your-server:8443/auth/callback`.

### HTTPS deployment

When serving Dashlight over HTTPS (e.g. behind Caddy, Traefik, or nginx), update three things:

**1. `.env`**

```env
FRONTEND_URL=https://your-domain.com
COOKIE_SECURE=true
```

**2. GitHub OAuth App callback URL**

Update the Authorization callback URL to `https://your-domain.com/auth/callback`.

**3. `WEB_PORT` (optional)**

If your reverse proxy terminates TLS and forwards to port 80 of the `web` container, you can keep `WEB_PORT=80` internally and let the proxy handle 443.

> `TRUST_PROXY` is already hardcoded to `true` in `docker-compose.yml` (nginx sets `X-Forwarded-For` reliably). The value in `.env` is not used when running via Compose.

---

### Corporate CA certificate

If your Docker build environment intercepts outbound TLS (e.g. corporate proxy), you must inject the CA bundle at **build time** so that `pnpm install` and `tsc` can reach the registry.

The certificate is baked into the image during `docker compose build` — it is not a runtime environment variable and does not need to be passed when starting containers.

Dashlight includes a helper script that normalizes one or more certificate files and writes `.docker-certs.env` for you:

```bash
pnpm certs:docker-env -- <cert1> [cert2 ...]
```

The script supports both input formats automatically (per file):

- Real PEM text (`-----BEGIN CERTIFICATE----- ...`)
- Base64-wrapped PEM text (content starts with `LS0t...`)

It combines all provided certs in memory and writes a single line to `.docker-certs.env`:

```env
EXTRA_CA_CERTS_B64=<single-base64-encoded-PEM-bundle>
```

No intermediate combined certificate file is created.

**How the Docker TLS env vars are used**

- `DASHLIGHT_EXTRA_CA_FILE`: file containing only injected custom CA certificates.
- `DASHLIGHT_CA_BUNDLE`: merged CA bundle (system roots + custom certs).
- `SSL_CERT_FILE`: points OpenSSL-based clients to the merged bundle.
- `NODE_EXTRA_CA_CERTS`: tells Node.js to append custom certs to Node's default trust.

This split keeps trust explicit and debuggable: custom certs stay isolated, while runtime/build tools still retain default public CA trust.

**Single certificate**

```bash
pnpm certs:docker-env -- my-ca.pem
```

**Multiple certificates**

Pass all cert files as arguments. The script normalizes and combines them:

```bash
pnpm certs:docker-env -- ca-1.pem ca-2.pem ca-3.pem
```

**Quick validation (optional)**

`EXTRA_CA_CERTS_B64` should decode once to PEM and should not require a second decode:

```bash
val=$(awk -F= '/^EXTRA_CA_CERTS_B64=/{print substr($0,index($0,"=")+1)}' .docker-certs.env)
printf '%s' "$val" | base64 -d | head -n 2
```

Expected output starts with:

```text
-----BEGIN CERTIFICATE-----
```

**Build and run (recommended sequence)**

```bash
docker compose --env-file .env --env-file .docker-certs.env build --no-cache
docker compose --env-file .env --env-file .docker-certs.env up -d --force-recreate
```

**Verify certificate in the running server container (optional)**

Use this to quickly confirm that the runtime extra CA file exists and begins with PEM content:

```bash
docker compose exec -T server sh -lc "head -c 40 /opt/dashlight/extra-ca-certificates.pem && echo"
```

> `docker compose up` in this environment does not support `--no-cache`. Use `--no-cache` only with `docker compose build`.

> `.docker-certs.env` is gitignored — never commit it. It contains your CA certificates encoded as base64.

If the build environment does **not** intercept TLS (home network, CI with public access), omit `--env-file .docker-certs.env` entirely — the build proceeds with the base image trust store only.

---

## Troubleshooting

**Login fails with "redirect_uri_mismatch"**
The Authorization callback URL in your GitHub OAuth App does not match where Dashlight is running. It must be exactly `http(s)://your-host:port/auth/callback`. Update it at [github.com/settings/developers](https://github.com/settings/developers).

**Blank page or redirect loop after login**
`FRONTEND_URL` doesn't match the URL you opened in the browser. They must be identical (same scheme, host, and port). Update `.env` and restart.

**Session cookie not sent / 401 on every request**
If serving over HTTPS, ensure `COOKIE_SECURE=true`. If the browser blocks the cookie, check that `FRONTEND_URL` uses `https://` and that your reverse proxy forwards `X-Forwarded-Proto`.

**No repositories shown**
Check `GITHUB_REPOS` and `GITHUB_ORG` in `.env`. If both are unset, all repos the signed-in user can access are shown — verify the OAuth token has the `repo` scope. Organisation repos also require the user to have authorised the OAuth App for that org (SAML SSO orgs need an extra "Authorize" step on GitHub's OAuth screen).

**PAT mode: server exits immediately on startup**
The server validates the PAT against the GitHub API before accepting connections. If `GITHUB_TOKEN` is invalid, expired, or missing the `repo` scope, the server logs the error and exits. Run `docker compose logs server` to see the reason.

**`docker compose up` appears to hang**
The `web` container waits for the `server` container to pass its health check before starting. If the server exits immediately (missing required env var, bad `SESSION_SECRET`, or invalid PAT), run `docker compose logs server` to see the startup error.

**GitHub API calls fail in a corporate network**
Set `HTTPS_PROXY` (and optionally `HTTP_PROXY`, `NO_PROXY`) in `.env`. These are passed to the server at runtime for all outbound calls to `api.github.com`. If the corporate proxy uses a private CA, inject it at build time via `EXTRA_CA_CERTS_B64` (see [Corporate CA certificate](#corporate-ca-certificate)).

---

## Development

```bash
pnpm install
```

Copy `env.example` to `.env` and configure your chosen authentication mode. For OAuth, fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET`. For PAT mode, set `GITHUB_TOKEN` (and optionally `APP_PASSWORD` + `SESSION_SECRET`). The dev server reads `.env` at startup.

```bash
# Run both packages in watch mode
pnpm dev
```

- Server: `http://localhost:8080`
- Web (Vite dev server): `http://localhost:5174` — proxies `/auth`, `/proxy`, `/api`, `/system` to the server automatically.

**Type check + test:**

```bash
pnpm typecheck
pnpm test
```

---

## Architecture

```
Browser
  └── React SPA (TanStack Router + React Query, IndexedDB persistence)
       │  all requests to same origin — no CORS
       ▼
nginx (port 5174)
  ├── /* (static)              → serve React SPA from /usr/share/nginx/html
  └── /auth|api|proxy|system/* → proxy_pass → Hono Server (internal)
       │  cookie: session=<signed JWT>  (HttpOnly, no token inside)
       ▼
Hono Server (Node 22, internal only)
  ├── /auth/*     — GitHub OAuth flow, session management
  ├── /proxy/*    — Authenticated GitHub API proxy (LRU cache)
  ├── /api/score  — Repository health scoring (7 categories)
  └── /system/*   — Health check
       │
       ▼
GitHub API
```

**Scores** are computed lazily when you navigate to a repository detail page (not on dashboard load). Results are cached for 24 hours. Seven categories: Community Health, Branch Protection, CI/CD Workflows, Build Success Rate, Security Practices, Documentation, Maintenance.

---

## Project layout

```
packages/
  server/   — Hono TypeScript server
  web/      — React 19 frontend
docker-compose.yml
env.example
```
