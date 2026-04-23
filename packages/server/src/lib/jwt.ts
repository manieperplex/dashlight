import { SignJWT, jwtVerify } from "jose"
import { log } from "./logger.js"

export interface SessionPayload {
  sub: string       // GitHub user ID (string for JWT spec)
  sessionId: string // Opaque ID — used to look up token in session store
  login: string
  name: string
  avatarUrl: string
  iat: number
  exp: number
  pwh?: string      // Password fingerprint — PAT+password sessions only; absent in OAuth/open sessions
}

function getSecret(): Uint8Array {
  const secret = process.env["SESSION_SECRET"]
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters")
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  })

  if (
    typeof payload["sub"] !== "string" ||
    typeof payload["sessionId"] !== "string" ||
    typeof payload["login"] !== "string" ||
    typeof payload["name"] !== "string" ||
    typeof payload["avatarUrl"] !== "string"
  ) {
    throw new Error("Invalid session payload shape")
  }

  return payload as unknown as SessionPayload
}

export function validateSessionSecret(): void {
  const secret = process.env["SESSION_SECRET"]
  if (!secret) {
    log.error("SESSION_SECRET is not set — exiting")
    process.exit(1)
  }
  if (secret.length < 32) {
    log.error("SESSION_SECRET must be at least 32 characters — exiting")
    process.exit(1)
  }
}
