import { describe, it, expect } from "vitest"
import { QueryClient, dehydrate } from "@tanstack/react-query"

// The filter that main.tsx passes to PersistQueryClientProvider.
// Extracted here so it can be tested in isolation without mounting the full app.
function shouldDehydrateQuery(query: { queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] !== "auth"
}

// Build a QueryClient, seed it with data under a given key, dehydrate it through
// the filter, and return the dehydrated query keys.
function dehydratedKeys(queryKey: readonly unknown[], data: unknown): string[] {
  const client = new QueryClient()
  client.setQueryData(queryKey, data)
  const state = dehydrate(client, { shouldDehydrateQuery })
  return state.queries.map((q) => JSON.stringify(q.queryKey))
}

// ── shouldDehydrateQuery ──────────────────────────────────────────────────────

describe("shouldDehydrateQuery — auth exclusion filter", () => {
  it("excludes [auth, me]", () => {
    expect(shouldDehydrateQuery({ queryKey: ["auth", "me"] })).toBe(false)
  })

  it("excludes [auth, config]", () => {
    expect(shouldDehydrateQuery({ queryKey: ["auth", "config"] })).toBe(false)
  })

  it("excludes any query whose first key segment is 'auth'", () => {
    expect(shouldDehydrateQuery({ queryKey: ["auth", "anything", "nested"] })).toBe(false)
  })

  it("includes [repos, user]", () => {
    expect(shouldDehydrateQuery({ queryKey: ["repos", "user"] })).toBe(true)
  })

  it("includes [runs, owner/repo, options]", () => {
    expect(shouldDehydrateQuery({ queryKey: ["runs", "acme/api", { page: 1 }] })).toBe(true)
  })

  it("includes [score, owner, repo]", () => {
    expect(shouldDehydrateQuery({ queryKey: ["score", "acme", "api"] })).toBe(true)
  })
})

// ── Integration: dehydrate through the filter ─────────────────────────────────

describe("dehydrate with auth exclusion filter", () => {
  it("auth queries are absent from the dehydrated state", () => {
    const keys = dehydratedKeys(["auth", "me"], { login: "jan", name: "Jan", avatarUrl: "" })
    expect(keys).toHaveLength(0)
  })

  it("auth/config is absent from the dehydrated state", () => {
    const keys = dehydratedKeys(["auth", "config"], { mode: "pat", passwordRequired: false })
    expect(keys).toHaveLength(0)
  })

  it("non-auth queries survive dehydration", () => {
    const keys = dehydratedKeys(["repos", "user"], [{ id: 1 }])
    expect(keys).toContain(JSON.stringify(["repos", "user"]))
  })

  it("auth and non-auth queries coexist — only non-auth is dehydrated", () => {
    const client = new QueryClient()
    client.setQueryData(["auth", "me"], { login: "jan" })
    client.setQueryData(["repos", "user"], [{ id: 1 }])
    client.setQueryData(["auth", "config"], { mode: "oauth" })
    client.setQueryData(["runs", "acme/api", {}], { runs: [] })

    const state = dehydrate(client, { shouldDehydrateQuery })
    const keys = state.queries.map((q) => JSON.stringify(q.queryKey))

    expect(keys).not.toContain(JSON.stringify(["auth", "me"]))
    expect(keys).not.toContain(JSON.stringify(["auth", "config"]))
    expect(keys).toContain(JSON.stringify(["repos", "user"]))
    expect(keys).toContain(JSON.stringify(["runs", "acme/api", {}]))
  })
})
