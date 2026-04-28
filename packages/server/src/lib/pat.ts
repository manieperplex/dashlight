import { githubFetch } from "./github.js"
import { log } from "./logger.js"

export interface PATIdentity {
  login: string
  name: string | null
  avatarUrl: string
  userId: string
}

let _identity: PATIdentity | null = null

interface GHUserMinimal {
  id: number
  login: string
  name: string | null
  avatar_url: string
}

// repo is the only hard requirement: covers private repo access, actions API,
// and GET /user (basic profile — login, name, avatar_url). read:user is NOT
// needed for the token owner's own profile; it's only for other users' private
// data and email. read:org is optional (only needed when GITHUB_ORG is set).
const REQUIRED_SCOPES = ["repo"]

/**
 * Calls the GitHub API to validate the PAT in `GITHUB_TOKEN`, checks required
 * scopes from the `x-oauth-scopes` response header, and caches the resulting
 * identity for later use via `getPATIdentity()`.
 *
 * Calls `process.exit(1)` on any failure — meant for startup validation only.
 */
export async function validateAndCachePAT(): Promise<PATIdentity> {
  const token = process.env["GITHUB_TOKEN"]
  if (!token) {
    log.error("GITHUB_TOKEN is not set — exiting")
    process.exit(1)
  }

  let data: GHUserMinimal
  let grantedScopes: string | null

  try {
    const result = await githubFetch<GHUserMinimal>(token, "/user")
    data = result.data
    grantedScopes = result.grantedScopes
  } catch (err) {
    const e = err as { message?: string }
    log.error("PAT validation failed — could not reach GitHub API", { error: e.message })
    process.exit(1)
  }

  if (grantedScopes !== null) {
    const granted = new Set(grantedScopes.split(",").map((s) => s.trim()))
    const missing = REQUIRED_SCOPES.filter((s) => !granted.has(s))
    if (missing.length > 0) {
      log.error("PAT is missing required scopes — exiting", { missing: missing.join(", ") })
      process.exit(1)
    }
  }

  _identity = {
    login: data.login,
    name: data.name,
    avatarUrl: data.avatar_url,
    userId: String(data.id),
  }

  return _identity
}

/** Returns the cached PAT identity. Must call `validateAndCachePAT()` first. */
export function getPATIdentity(): PATIdentity {
  if (!_identity) {
    throw new Error("PAT identity not initialized — call validateAndCachePAT() first")
  }
  return _identity
}

/** Resets cached identity. Only used in tests. */
export function _resetPATIdentity(): void {
  _identity = null
}
