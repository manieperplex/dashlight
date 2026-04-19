import type { MiddlewareHandler } from "hono"
import { log } from "../lib/logger.js"

/** Logs each HTTP request/response as a structured JSON line. */
export function accessLog(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    await next()
    log.info("http", {
      method: c.req.method,
      path:   c.req.path,
      status: c.res.status,
      ms:     Date.now() - start,
    })
  }
}
