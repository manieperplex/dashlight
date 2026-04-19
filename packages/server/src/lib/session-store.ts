import { randomUUID } from "node:crypto"

interface SessionEntry {
  token: string
  userId: string
  expiresAt: number
}

// In-memory session store. Token never leaves the server.
// Lost on restart — users re-authenticate once per deploy (acceptable for 20 users).
const store = new Map<string, SessionEntry>()

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Sweep expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(id)
    }
  }
}, 5 * 60 * 1000).unref()

export function sessionCreate(token: string, userId: string): string {
  const sessionId = randomUUID()
  store.set(sessionId, {
    token,
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  })
  return sessionId
}

export function sessionGet(sessionId: string): SessionEntry | undefined {
  const entry = store.get(sessionId)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    store.delete(sessionId)
    return undefined
  }
  return entry
}

export function sessionDestroy(sessionId: string): void {
  store.delete(sessionId)
}

export function sessionCount(): number {
  return store.size
}
