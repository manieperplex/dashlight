import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { rateLimiter } from "./middleware/rate-limit.js"
import { accessLog } from "./middleware/access-log.js"
import { log } from "./lib/logger.js"
import { rateLimitKey } from "./lib/rate-limit-key.js"
import { validateSessionSecret } from "./lib/jwt.js"
import { logStartupDiagnostics } from "./lib/startup-log.js"
import { securityHeaders } from "./middleware/security.js"
import { validateAndCachePAT, getPATIdentity } from "./lib/pat.js"
import authRoutes from "./routes/auth.js"
import proxyRoutes from "./routes/proxy.js"
import reposRoutes from "./routes/repos.js"
import scoreRoutes from "./routes/score.js"
import systemRoutes from "./routes/system.js"
import { authMiddleware } from "./middleware/auth.js"
import { cacheInvalidateUser } from "./lib/cache.js"
import type { AuthEnv } from "./middleware/auth.js"

async function bootstrap() {
  // ── Startup validation ────────────────────────────────────────────────────────
  if (process.env["GITHUB_TOKEN"]) {
    // PAT mode — OAuth client vars are ignored
    if (process.env["APP_PASSWORD"]) {
      // Need JWT signing when password protection is enabled
      validateSessionSecret()
      if (process.env["COOKIE_SECURE"] !== "true") {
        log.warn(
          "APP_PASSWORD is set but COOKIE_SECURE is not 'true' — " +
          "session cookies will not have the Secure flag. " +
          "Set COOKIE_SECURE=true when serving over HTTPS.",
        )
      }
    }
    // Hard-fail if the PAT is invalid or missing required scopes
    await validateAndCachePAT()
    log.info("PAT authentication mode enabled", { login: getPATIdentity().login })
  } else {
    // OAuth mode
    validateSessionSecret()
    const requiredEnv = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        log.error("Required env var is not set — exiting", { key })
        process.exit(1)
      }
    }
  }

  // ── App setup ─────────────────────────────────────────────────────────────────
  const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:5174"
  try {
    new URL(frontendUrl)
  } catch {
    log.error("FRONTEND_URL is not a valid URL — exiting", { frontendUrl })
    process.exit(1)
  }

  logStartupDiagnostics()

  const app = new Hono()

  app.use("*", accessLog())
  app.use(
    "*",
    cors({
      origin: frontendUrl,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      // Authorization header removed: the app uses cookie-based auth only.
      allowHeaders: ["Content-Type"],
      exposeHeaders: ["X-Cache", "X-RateLimit-Remaining"],
    }),
  )
  app.use("*", securityHeaders)

  // Global rate limiter (300 req/min)
  app.use(
    "*",
    rateLimiter({
      windowMs: 60_000,
      limit: 300,
      keyGenerator: rateLimitKey,
    }),
  )

  // Strict rate limit only on OAuth endpoints (not /auth/me which is called on every navigation)
  const oauthRateLimiter = rateLimiter({
    windowMs: 60_000,
    limit: 20,
    keyGenerator: rateLimitKey,
  })
  app.use("/auth/login", oauthRateLimiter)
  app.use("/auth/callback", oauthRateLimiter)

  // Tighter limit for the password endpoint — configurable via PAT_LOGIN_MAX_ATTEMPTS.
  // Combined with the 500ms artificial delay in the handler, this caps brute-force
  // throughput while allowing realistic fat-finger retries.
  const _parsedMaxAttempts = parseInt(process.env["PAT_LOGIN_MAX_ATTEMPTS"] ?? "", 10)
  const patLoginMaxAttempts =
    !isNaN(_parsedMaxAttempts) && _parsedMaxAttempts > 0 ? _parsedMaxAttempts : 10
  if (isNaN(_parsedMaxAttempts) || _parsedMaxAttempts <= 0) {
    log.warn("PAT_LOGIN_MAX_ATTEMPTS is invalid or not set — using default 10", {
      raw: process.env["PAT_LOGIN_MAX_ATTEMPTS"],
    })
  }
  const patLoginLimiter = rateLimiter({
    windowMs: 15 * 60_000,
    limit: patLoginMaxAttempts,
    keyGenerator: rateLimitKey,
  })
  app.use("/auth/pat-login", patLoginLimiter)

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.route("/auth", authRoutes)
  app.route("/proxy", proxyRoutes)
  app.route("/api/repos", reposRoutes)
  app.route("/api/score", scoreRoutes)
  app.route("/system", systemRoutes)

  // Clear server-side cache for the authenticated user
  const refreshApp = new Hono<AuthEnv>()
  refreshApp.use("/*", authMiddleware)
  refreshApp.post("/", (c) => {
    const session = c.get("session")
    cacheInvalidateUser(session.sub)
    return c.body(null, 204)
  })
  app.route("/api/refresh", refreshApp)

  // ── Start server ─────────────────────────────────────────────────────────────
  const port = parseInt(process.env["PORT"] ?? "8080", 10)

  serve({ fetch: app.fetch, port }, () => {
    log.info("Dashlight server started", {
      port,
      frontendUrl,
      nodeEnv: process.env["NODE_ENV"] ?? "development",
    })
  })
}

bootstrap().catch((err: unknown) => {
  const e = err as { message?: string }
  log.error("Startup failed", { error: e.message })
  process.exit(1)
})
