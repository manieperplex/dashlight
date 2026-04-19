# Caching

Dashlight uses a four-layer cache to minimise GitHub API quota consumption while keeping the dashboard responsive.

## Flow

```
Browser
  │
  ├─ [L1] TanStack Query — in-memory cache       staleTime per query (default 5 min)
  │        If data is stale → issue fetch to server
  │
  ├─ [L2] IndexedDB (idb-keyval persister)        gcTime / maxAge: 24 h
  │        Rehydrated on page load — survives refresh and tab close
  │
  └── HTTP GET /proxy/...
              │
              ▼
        Hono server
              │
              ├─ [L3] Server LRU cache (per user)    TTL by data type (see table below)
              │        HIT  → return cached JSON + X-Cache: HIT
              │        MISS → check stale store for a saved ETag
              │
              ├─ [L4] Stale store (ETag revalidation) 24 h fixed TTL
              │        Has ETag → conditional GET with If-None-Match header
              │
              └── GitHub API
                        │
                        ├─ 304 Not Modified → serve from stale store (0 quota used)
                        └─ 200 OK           → update L3 + L4, return fresh data
```

## Components

| Layer | Package | Key file | Purpose |
|-------|---------|----------|---------|
| L1 — Query cache | `@dashlight/web` | `src/lib/queryClient.ts` | In-memory cache per query key; prevents redundant server calls within a browser session |
| L2 — IndexedDB | `@dashlight/web` | `src/lib/queryClient.ts` | Persists the query cache to disk so data survives page reloads without a network round-trip |
| L3 — LRU cache | `@dashlight/server` | `src/lib/cache.ts` | Per-user server-side cache; shields GitHub API from repeated identical requests across navigations or users |
| L4 — Stale store | `@dashlight/server` | `src/lib/cache.ts` | Stores the last known response + ETag; allows a free conditional 304 revalidation instead of a full re-fetch when L3 expires |

## TTL reference

### Server (L3) — `packages/server/src/lib/cache.ts`

Configurable at runtime via the server `.env` file.

| Data type | Default TTL | Env var *(planned)* |
|-----------|------------|---------------------|
| `runs` | 2 min | — |
| `jobs` | 2 min | — |
| `annotations` | 5 min | — |
| `workflows` | 10 min | — |
| `repos` | 15 min | — |
| `orgs` | 30 min | — |
| `score` | 24 h | — |
| `yaml` / `logs` | 7 days | — |
| *(default)* | 5 min | — |

Stale store (L4) always uses a fixed **24 h** TTL — long enough to outlive every L3 window so a 304 hit is always possible.

### Client (L1 / L2) — `packages/web/src/lib/queryClient.ts`

Baked into the bundle at build time (Vite SPA — no runtime env file for the web).

| Setting | Value | Scope |
|---------|-------|-------|
| `staleTime` | 5 min | Global default |
| `staleTime` | 2 min | Recent runs, job lists |
| `staleTime` | 10 min | Workflow lists |
| `staleTime` | 15 min | Repository lists |
| `staleTime` | 24 h | Score |
| `refetchInterval` | 10 s | Active (in-progress) runs and jobs |
| `refetchInterval` | 30 s | Run lists on detail pages |
| `refetchInterval` | 60 s | Recent runs on dashboard |
| `gcTime` | 24 h | All queries (matches IndexedDB maxAge) |

## Why two separate TTL layers?

The server TTL (L3) controls **data freshness** — how old the data GitHub sees can be.
The client `staleTime` (L1) controls **network chattiness** — how often the browser asks the server.

Setting both independently means you can, for example, have the browser check the server every 60 s (low client chattiness) while the server returns a cached response valid for 2 min (low GitHub API load), without the browser ever hitting GitHub directly.
