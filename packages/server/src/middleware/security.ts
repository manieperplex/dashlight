import type { MiddlewareHandler } from "hono"

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  // Security headers (CSP, X-Frame-Options, etc.) are set by nginx for all
  // responses — both static assets and proxied API calls. nginx strips any
  // duplicates via proxy_hide_header before adding its own authoritative values.
  //
  // HSTS is the exception: nginx cannot conditionally set it based on
  // COOKIE_SECURE, so the server sets it here when TLS is confirmed active.
  if (process.env["COOKIE_SECURE"] === "true") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
}
