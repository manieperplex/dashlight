import { getConnInfo } from "@hono/node-server/conninfo"
import type { Context } from "hono"

// RFC 791 IPv4 and RFC 2373 IPv6 — loose but sufficient for a rate-limit key.
// The goal is to reject arbitrary strings (e.g. spoofed header payloads), not
// to perform strict address validation.
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[0-9a-fA-F:]+$/

function isValidIp(s: string): boolean {
  return IPV4_RE.test(s) || (IPV6_RE.test(s) && s.includes(":"))
}

/**
 * Derive a rate-limit key from the incoming request.
 *
 * Default (TRUST_PROXY unset or false):
 *   Uses the TCP connection's remote address. Clients cannot forge this — it is
 *   the address of whoever opened the socket to the server.
 *
 * TRUST_PROXY=true:
 *   Trusts the first IP in X-Forwarded-For (or X-Real-IP as fallback).
 *   Only enable this when the server sits behind a trusted reverse proxy that
 *   strips client-supplied X-Forwarded-For headers before appending its own.
 *   Values that are not valid IP addresses are rejected to prevent header
 *   spoofing from bypassing rate limiting.
 */
export function rateLimitKey(c: Context): string {
  if (process.env["TRUST_PROXY"] === "true") {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    if (forwarded && isValidIp(forwarded)) return forwarded
    const realIp = c.req.header("x-real-ip")?.trim()
    if (realIp && isValidIp(realIp)) return realIp
    return "anon"
  }
  try {
    return getConnInfo(c).remote.address ?? "anon"
  } catch {
    // getConnInfo throws outside the Node.js adapter (e.g. in tests or non-Node runtimes)
    return "anon"
  }
}

export { isValidIp }
