import { createMiddleware } from "hono/factory"
import type { Context } from "hono"

interface RateLimitOptions {
  windowMs: number
  limit: number
  keyGenerator: (c: Context) => string
}

export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, limit, keyGenerator } = options
  const counts = new Map<string, { count: number; resetAt: number }>()

  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of counts) {
      if (entry.resetAt <= now) counts.delete(key)
    }
  }, windowMs).unref()

  return createMiddleware(async (c, next) => {
    const key = keyGenerator(c)
    const now = Date.now()
    const entry = counts.get(key)

    if (!entry || entry.resetAt <= now) {
      counts.set(key, { count: 1, resetAt: now + windowMs })
      await next()
      return
    }

    if (entry.count >= limit) {
      return c.json({ error: "Too many requests" }, 429)
    }

    entry.count++
    await next()
  })
}
