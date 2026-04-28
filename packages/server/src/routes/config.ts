import { Hono } from "hono"
import { authMiddleware } from "../middleware/auth.js"
import type { AuthEnv } from "../middleware/auth.js"

const config = new Hono<AuthEnv>()

config.use("/*", authMiddleware)

/**
 * GET /api/config
 * Returns static server configuration that the frontend needs at runtime.
 */
config.get("/", (c) => {
  const raw = process.env["WATCH_WORKFLOWS"] ?? ""
  const watchWorkflows = raw.split(",").map((s) => s.trim()).filter(Boolean)
  return c.json({ watchWorkflows })
})

export default config
