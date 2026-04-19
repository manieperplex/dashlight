import { createMiddleware } from "hono/factory"
import { verifySession } from "../lib/jwt.js"
import { sessionGet } from "../lib/session-store.js"
import type { SessionPayload } from "../lib/jwt.js"

export interface AuthEnv {
  Variables: {
    session: SessionPayload
    githubToken: string
  }
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
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
