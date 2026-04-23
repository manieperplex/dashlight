import { createMiddleware } from "hono/factory"
import { createHash } from "node:crypto"
import { verifySession } from "../lib/jwt.js"
import { sessionGet } from "../lib/session-store.js"
import { getPATIdentity } from "../lib/pat.js"
import type { SessionPayload } from "../lib/jwt.js"

function passwordFingerprint(password: string): string {
  return createHash("sha256").update(password).digest("base64url").slice(0, 22)
}

export interface AuthEnv {
  Variables: {
    session: SessionPayload
    githubToken: string
  }
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const patToken = process.env["GITHUB_TOKEN"]

  if (patToken) {
    const appPassword = process.env["APP_PASSWORD"]

    if (!appPassword) {
      // PAT mode, open access — no cookie or session required
      const identity = getPATIdentity()
      c.set("session", {
        sub: identity.userId,
        sessionId: "pat",
        login: identity.login,
        name: identity.name ?? identity.login,
        avatarUrl: identity.avatarUrl,
        iat: 0,
        exp: 0,
      })
      c.set("githubToken", patToken)
      await next()
      return
    }

    // PAT + password mode: verify JWT cookie but skip session store (stateless)
    const cookie = getCookie(c.req.header("cookie"), "session")
    if (!cookie) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    let payload: SessionPayload
    try {
      payload = await verifySession(cookie)
    } catch {
      return c.json({ error: "Unauthorized" }, 401)
    }

    // Reject OAuth cookies — only PAT-issued JWTs are valid in PAT+password mode
    if (payload.sessionId !== "pat") {
      return c.json({ error: "Unauthorized" }, 401)
    }

    // Reject tokens issued for a different (or absent) password — ensures that
    // adding APP_PASSWORD or rotating it immediately invalidates old sessions.
    if (payload.pwh !== passwordFingerprint(appPassword)) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    c.set("session", payload)
    c.set("githubToken", patToken) // always use PAT token, not one from JWT
    await next()
    return
  }

  // OAuth mode
  const cookie = getCookie(c.req.header("cookie"), "session")
  if (!cookie) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  let payload: SessionPayload
  try {
    payload = await verifySession(cookie)
  } catch {
    return c.json({ error: "Unauthorized" }, 401)
  }

  const entry = sessionGet(payload.sessionId)
  if (!entry) {
    return c.json({ error: "Session expired" }, 401)
  }

  c.set("session", payload)
  c.set("githubToken", entry.token)

  await next()
})

function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=")
    if (key?.trim() === name) {
      return valueParts.join("=").trim()
    }
  }
  return undefined
}
