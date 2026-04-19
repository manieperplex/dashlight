import { describe, it, expect, afterEach } from "vitest"
import { Hono } from "hono"
import { securityHeaders } from "./security.js"

function makeApp() {
  const app = new Hono()
  app.use("*", securityHeaders)
  app.get("/", (c) => c.text("ok"))
  return app
}

afterEach(() => {
  delete process.env["COOKIE_SECURE"]
})

// Security headers (CSP, X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, Permissions-Policy) are set exclusively by nginx, which is
// the single public ingress. The server middleware intentionally does NOT set
// them — nginx strips any that leak through with proxy_hide_header so only one
// authoritative value ever reaches the browser.
//
// The server middleware's only responsibility is HSTS, which must be
// conditional on COOKIE_SECURE (nginx cannot read env vars).

describe("securityHeaders middleware", () => {
  it("does NOT set Content-Security-Policy (nginx is authoritative)", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("content-security-policy")).toBeNull()
  })

  it("does NOT set X-Frame-Options (nginx is authoritative)", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("x-frame-options")).toBeNull()
  })

  it("does NOT set X-Content-Type-Options (nginx is authoritative)", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("x-content-type-options")).toBeNull()
  })

  it("does NOT set Referrer-Policy (nginx is authoritative)", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("referrer-policy")).toBeNull()
  })

  it("does NOT set Permissions-Policy (nginx is authoritative)", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("permissions-policy")).toBeNull()
  })

  it("does NOT set X-XSS-Protection (deprecated header removed)", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("x-xss-protection")).toBeNull()
  })

  it("does NOT set HSTS when COOKIE_SECURE is not set", async () => {
    const res = await makeApp().request("/")
    expect(res.headers.get("strict-transport-security")).toBeNull()
  })

  it("sets HSTS with 1-year max-age and includeSubDomains when COOKIE_SECURE=true", async () => {
    process.env["COOKIE_SECURE"] = "true"
    const res = await makeApp().request("/")
    const hsts = res.headers.get("strict-transport-security") ?? ""
    expect(hsts).toContain("max-age=31536000")
    expect(hsts).toContain("includeSubDomains")
  })
})
