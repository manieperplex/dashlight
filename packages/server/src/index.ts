import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { rateLimiter } from "./middleware/rate-limit.js"
import { accessLog } from "./middleware/access-log.js"
import { log } from "./lib/logger.js"
import { rateLimitKey } from "./lib/rate-limit-key.js"
import { validateSessionSecret } from "./lib/jwt.js"
import { logCertStatus } from "./lib/certs.js"
import { securityHeaders } from "./middleware/security.js"
import authRoutes from "./routes/auth.js"
import proxyRoutes from "./routes/proxy.js"
import reposRoutes from "./routes/repos.js"
import scoreRoutes from "./routes/score.js"
import systemRoutes from "./routes/system.js"
import { authMiddleware } from "./middleware/auth.js"
import { cacheInvalidateUser } from "./lib/cache.js"
import type { AuthEnv } from "./middleware/auth.js"

// ── Startup validation ────────────────────────────────────────────────────────
validateSessionSecret()

const requiredEnv = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const
for (const key of requiredEnv) {
  if (!process.env[key]) {
    log.error("Required env var is not set — exiting", { key })
    process.exit(1)
  }
}

logCertStatus()

// ── App setup ─────────────────────────────────────────────────────────────────
const app = new Hono()

const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:5174"
try {
  new URL(frontendUrl)
} catch {
  log.error("FRONTEND_URL is not a valid URL — exiting", { frontendUrl })
  process.exit(1)
}

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
  })
)
app.use("*", securityHeaders)

// Global rate limiter (300 req/min)
app.use(
  "*",
  rateLimiter({
    windowMs: 60_000,
    limit: 300,
    keyGenerator: rateLimitKey,
  })
)

// Strict rate limit only on OAuth endpoints (not /auth/me which is called on every navigation)
const oauthRateLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: rateLimitKey,
})
app.use("/auth/login", oauthRateLimiter)
app.use("/auth/callback", oauthRateLimiter)

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
