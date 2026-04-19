import { Hono } from "hono"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("../../package.json") as { version: string }

const system = new Hono()

system.get("/health", (c) => {
  return c.json({ status: "ok", version: pkg.version })
})

export default system
