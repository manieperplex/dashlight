import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { signSession, verifySession } from "../lib/jwt.js";
import { sessionCreate, sessionDestroy } from "../lib/session-store.js";
import { request } from "undici";
import { githubFetch, agent } from "../lib/github.js";
import { log } from "../lib/logger.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AuthEnv } from "../middleware/auth.js";

const GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN = "https://github.com/login/oauth/access_token";

// Default OAuth scope. repo is required for private-repo workflow-run access.
// Override via GITHUB_SCOPE env var for public-only installations.
const DEFAULT_SCOPE = "read:user,user:email,repo,read:org";

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

const auth = new Hono<AuthEnv>();

auth.get("/login", (c) => {
  const clientId = process.env["GITHUB_CLIENT_ID"];
  if (!clientId) return c.json({ error: "OAuth not configured" }, 500);

  // Read scope at request time so GITHUB_SCOPE overrides take effect without restart
  const scope = process.env["GITHUB_SCOPE"]?.trim() || DEFAULT_SCOPE;

  // CSRF protection: random state bound to a short-lived HttpOnly cookie
  const state = randomBytes(32).toString("hex");

  // PKCE (RFC 7636): code_verifier stored in a short-lived HttpOnly cookie;
  // code_challenge (S256) sent in the authorization URL. Protects against
  // authorization-code interception even when the client_secret is also used.
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Derive the callback URL from the incoming request so the same OAuth App
  // works across environments (local dev, Docker, staging, production) without
  // changing GitHub App settings. Register each environment's URL once in the
  // OAuth App; GitHub validates redirect_uri against that list.
  const proto =
    c.req.header("x-forwarded-proto") ?? (isSecure() ? "https" : "http");
  const host = c.req.header("host") ?? "localhost:5174";
  const redirectUri = `${proto}://${host}/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const secure = isSecure();
  const cookieFlags = `HttpOnly; SameSite=Lax; Max-Age=300; Path=/auth/callback${secure ? "; Secure" : ""}`;

  // Both the state and PKCE verifier use Path=/auth/callback so they are only
  // sent to the one endpoint that needs them.
  // Use append:true for the second Set-Cookie so it is not replaced by the first.
  c.header("Set-Cookie", `oauth_state=${state}; ${cookieFlags}`);
  c.header("Set-Cookie", `pkce_verifier=${codeVerifier}; ${cookieFlags}`, {
    append: true,
  });

  return c.redirect(`${GITHUB_OAUTH_AUTHORIZE}?${params.toString()}`);
});

auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code || !stateParam) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  // Validate state (CSRF check)
  const stateCookie = getCookie(c.req.header("cookie"), "oauth_state");
  if (!stateCookie || stateCookie !== stateParam) {
    return c.json({ error: "Invalid state — possible CSRF" }, 400);
  }

  // Read PKCE verifier
  const codeVerifier = getCookie(c.req.header("cookie"), "pkce_verifier");
  if (!codeVerifier) {
    return c.json({ error: "Missing PKCE verifier" }, 400);
  }

  const secure = isSecure();
  const clearCookieFlags = `HttpOnly; SameSite=Lax; Max-Age=0; Path=/auth/callback${secure ? "; Secure" : ""}`;
  c.header("Set-Cookie", `oauth_state=; ${clearCookieFlags}`);
  c.header("Set-Cookie", `pkce_verifier=; ${clearCookieFlags}`, {
    append: true,
  });

  // Exchange code for token.
  // Uses the shared undici agent — NODE_EXTRA_CA_CERTS (baked in at build time)
  // and HTTPS_PROXY / HTTP_PROXY / NO_PROXY are picked up automatically.
  let tokenData: GitHubTokenResponse;
  try {
    const tokenRes = await request(GITHUB_OAUTH_TOKEN, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env["GITHUB_CLIENT_ID"],
        client_secret: process.env["GITHUB_CLIENT_SECRET"],
        code,
        code_verifier: codeVerifier,
      }),
      dispatcher: agent,
      signal: AbortSignal.timeout(10_000),
    });
    if (tokenRes.statusCode >= 400) {
      await tokenRes.body.text();
      return c.json({ error: "Token exchange failed" }, 502);
    }
    tokenData = (await tokenRes.body.json()) as GitHubTokenResponse;
  } catch (error) {
    const requestError = error as
      | { name?: string; message?: string }
      | undefined;
    if (requestError?.name === "AbortError") {
      return c.json({ error: "Token exchange timed out" }, 504);
    }
    log.error("GitHub token exchange request failed", {
      errorName: requestError?.name,
      errorMessage: requestError?.message,
    });
    return c.json({ error: "Token exchange failed" }, 502);
  }
  if (tokenData.error || !tokenData.access_token) {
    return c.json(
      { error: tokenData.error_description ?? "Token exchange failed" },
      400,
    );
  }

  // Fetch user info
  const { data: ghUser, grantedScopes } = await githubFetch<GitHubUser>(
    tokenData.access_token,
    "/user",
  );

  // Validate that required OAuth scopes were granted.
  // GitHub does not enforce requested scopes — a user can deny permissions.
  // A missing scope causes silent API failures downstream, so we fail early.
  const REQUIRED_SCOPES = ["repo", "read:user"];
  if (grantedScopes === null) {
    return c.json(
      { error: "Could not verify OAuth scopes — please try signing in again." },
      403,
    );
  }
  const granted = new Set(grantedScopes.split(",").map((s) => s.trim()));
  const missing = REQUIRED_SCOPES.filter((s) => !granted.has(s));
  if (missing.length > 0) {
    return c.json(
      {
        error: `Insufficient permissions. Missing OAuth scopes: ${missing.join(", ")}. Please sign out and re-authorize the application.`,
      },
      403,
    );
  }

  // Store token in session map; JWT holds only session ID + user metadata
  const sessionId = sessionCreate(tokenData.access_token, String(ghUser.id));

  const jwt = await signSession({
    sub: String(ghUser.id),
    sessionId,
    login: ghUser.login,
    name: ghUser.name ?? ghUser.login,
    avatarUrl: ghUser.avatar_url,
  });

  // Both dev (Vite proxy) and Docker (nginx) route /auth through the same origin
  // as the React app, so we can set the session cookie directly here.
  c.header(
    "Set-Cookie",
    `session=${jwt}; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 3600}; Path=/${secure ? "; Secure" : ""}`,
    { append: true },
  );

  return c.redirect("/");
});

// Logout: await session destruction before responding so the server-side
// session entry is guaranteed to be removed when the client receives 200.
auth.post("/logout", async (c) => {
  const cookie = getCookie(c.req.header("cookie"), "session");
  if (cookie) {
    try {
      const payload = await verifySession(cookie);
      sessionDestroy(payload.sessionId);
    } catch {
      // Ignore invalid or already-expired cookie — session is effectively dead
    }
  }
  c.header(
    "Set-Cookie",
    `session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/`,
  );
  return c.json({ ok: true });
});

auth.get("/me", authMiddleware, (c) => {
  const session = c.get("session");
  return c.json({
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl,
  });
});

// Secure flag should be set only when the app is served over HTTPS.
// NODE_ENV=production does not imply HTTPS (e.g. local Docker over HTTP).
// Set COOKIE_SECURE=true explicitly when deploying behind TLS.
function isSecure(): boolean {
  return process.env["COOKIE_SECURE"] === "true";
}

function getCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key?.trim() === name) return valueParts.join("=").trim();
  }
  return undefined;
}

export { getCookie };
export default auth;
