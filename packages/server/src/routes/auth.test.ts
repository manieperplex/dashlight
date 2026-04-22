import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock("undici", () => ({
  request: vi.fn(),
  EnvHttpProxyAgent: class {},
}));

vi.mock("../lib/jwt.js", () => ({
  signSession: vi.fn().mockResolvedValue("signed.jwt.token"),
  verifySession: vi.fn(),
}));

vi.mock("../lib/session-store.js", () => ({
  sessionCreate: vi.fn().mockReturnValue("session-id-123"),
  sessionDestroy: vi.fn(),
  sessionGet: vi.fn(),
}));

vi.mock("../lib/github.js", () => ({
  githubFetch: vi.fn().mockResolvedValue({
    data: {
      id: 42,
      login: "octocat",
      name: "The Octocat",
      avatar_url: "https://avatars.githubusercontent.com/u/583231",
    },
    grantedScopes: "repo,read:user,user:email,read:org",
  }),
  agent: {},
}));

vi.mock("../lib/logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  authMiddleware: vi.fn(
    async (c: import("hono").Context, next: () => Promise<void>) => {
      c.set("session", {
        sub: "42",
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://avatars.githubusercontent.com/u/583231",
        sessionId: "s1",
      });
      await next();
    },
  ),
}));

// Dynamic imports after mocks are hoisted
import { request as undiciRequest } from "undici";
import { signSession, verifySession } from "../lib/jwt.js";
import { sessionCreate, sessionDestroy } from "../lib/session-store.js";
import { getCookie } from "./auth.js";
import authRouter from "./auth.js";

const _mockSignSession = vi.mocked(signSession);
const mockVerifySession = vi.mocked(verifySession);
const mockSessionCreate = vi.mocked(sessionCreate);
const mockSessionDestroy = vi.mocked(sessionDestroy);
const mockUndiciRequest = vi.mocked(undiciRequest);

// ── Test app setup ────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  app.route("/auth", authRouter);
  return app;
}

// Default successful undici response for the GitHub token exchange
function mockTokenExchangeSuccess(accessToken = "gha_token") {
  mockUndiciRequest.mockResolvedValue({
    statusCode: 200,
    body: {
      json: () =>
        Promise.resolve({
          access_token: accessToken,
          token_type: "bearer",
          scope: "repo",
        }),
      text: () => Promise.resolve(""),
    },
    headers: {},
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["GITHUB_CLIENT_ID"] = "test-client-id";
  process.env["GITHUB_CLIENT_SECRET"] = "test-client-secret";
  process.env["FRONTEND_URL"] = "http://localhost:5174";
  delete process.env["GITHUB_SCOPE"];
  delete process.env["COOKIE_SECURE"];
});

afterEach(() => {
  delete process.env["GITHUB_CLIENT_ID"];
  delete process.env["GITHUB_CLIENT_SECRET"];
  delete process.env["FRONTEND_URL"];
  delete process.env["GITHUB_SCOPE"];
  delete process.env["COOKIE_SECURE"];
});

// ── /auth/login ───────────────────────────────────────────────────────────────

describe("GET /auth/login", () => {
  it("redirects to GitHub OAuth authorize URL", async () => {
    const res = await makeApp().request("/auth/login");
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("github.com/login/oauth/authorize");
    expect(location).toContain("client_id=test-client-id");
  });

  it("includes state parameter in the redirect URL", async () => {
    const res = await makeApp().request("/auth/login");
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/state=[0-9a-f]{64}/);
  });

  it("includes PKCE code_challenge and method=S256 in the redirect URL", async () => {
    const res = await makeApp().request("/auth/login");
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("code_challenge=");
    expect(location).toContain("code_challenge_method=S256");
  });

  it("sets HttpOnly oauth_state cookie scoped to /auth/callback", async () => {
    const res = await makeApp().request("/auth/login");
    const cookies = res.headers.getSetCookie();
    const stateCookie = cookies.find((c) => c.startsWith("oauth_state="));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("Path=/auth/callback");
    expect(stateCookie).toContain("SameSite=Lax");
  });

  it("sets HttpOnly pkce_verifier cookie scoped to /auth/callback", async () => {
    const res = await makeApp().request("/auth/login");
    const cookies = res.headers.getSetCookie();
    const pkceCookie = cookies.find((c) => c.startsWith("pkce_verifier="));
    expect(pkceCookie).toBeDefined();
    expect(pkceCookie).toContain("HttpOnly");
    expect(pkceCookie).toContain("Path=/auth/callback");
  });

  it("uses GITHUB_SCOPE env var when set", async () => {
    process.env["GITHUB_SCOPE"] = "read:user read:org";
    const res = await makeApp().request("/auth/login");
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("scope=read%3Auser+read%3Aorg");
  });

  it("returns 500 when GITHUB_CLIENT_ID is not configured", async () => {
    delete process.env["GITHUB_CLIENT_ID"];
    const res = await makeApp().request("/auth/login");
    expect(res.status).toBe(500);
  });

  it("does not set Secure flag when COOKIE_SECURE is not set", async () => {
    const res = await makeApp().request("/auth/login");
    const cookies = res.headers.getSetCookie();
    for (const c of cookies) {
      expect(c.toLowerCase()).not.toContain("secure");
    }
  });

  it("sets Secure flag when COOKIE_SECURE=true", async () => {
    process.env["COOKIE_SECURE"] = "true";
    const res = await makeApp().request("/auth/login");
    const cookies = res.headers.getSetCookie();
    for (const c of cookies) {
      expect(c).toContain("Secure");
    }
  });
});

// ── /auth/callback ─────────────────────────────────────────────────────────────

function makeCallbackRequest(
  overrides: {
    state?: string;
    stateCookie?: string;
    pkceVerifier?: string;
    code?: string;
  } = {},
) {
  const state = overrides.state ?? "abc123";
  const stateCookie = overrides.stateCookie ?? state;
  const pkceVerifier = overrides.pkceVerifier ?? "my-verifier";
  const code = overrides.code ?? "github-code";

  const cookieHeader = [
    `oauth_state=${stateCookie}`,
    `pkce_verifier=${pkceVerifier}`,
  ].join("; ");

  return makeApp().request(`/auth/callback?code=${code}&state=${state}`, {
    headers: { cookie: cookieHeader },
  });
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    mockTokenExchangeSuccess();
  });

  it("returns 400 when state param is missing", async () => {
    const res = await makeApp().request("/auth/callback?code=abc", {
      headers: { cookie: "oauth_state=abc" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when state does not match cookie", async () => {
    const res = await makeCallbackRequest({
      state: "real",
      stateCookie: "fake",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when pkce_verifier cookie is missing", async () => {
    const res = await makeApp().request("/auth/callback?code=abc&state=xyz", {
      headers: { cookie: "oauth_state=xyz" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("PKCE");
  });

  it("clears oauth_state and pkce_verifier cookies on valid request", async () => {
    const res = await makeCallbackRequest();
    const cookies = res.headers.getSetCookie();
    const stateClear = cookies.find((c) => c.startsWith("oauth_state=;"));
    const pkceClear = cookies.find((c) => c.startsWith("pkce_verifier=;"));
    expect(stateClear).toBeDefined();
    expect(pkceClear).toBeDefined();
    expect(stateClear).toContain("Max-Age=0");
    expect(pkceClear).toContain("Max-Age=0");
  });

  it("sends code_verifier in the token exchange body", async () => {
    await makeCallbackRequest({ pkceVerifier: "my-pkce-verifier-value" });

    expect(mockUndiciRequest).toHaveBeenCalled();
    const callBody = JSON.parse(
      mockUndiciRequest.mock.calls[0]![1]!.body as string,
    );
    expect(callBody.code_verifier).toBe("my-pkce-verifier-value");
  });

  it("returns 504 when GitHub token exchange times out", async () => {
    mockUndiciRequest.mockRejectedValue(
      Object.assign(new Error("abort"), { name: "AbortError" }),
    );

    const res = await makeCallbackRequest();
    expect(res.status).toBe(504);
  });

  it("returns 502 when GitHub token exchange fails before a response", async () => {
    mockUndiciRequest.mockRejectedValue(
      Object.assign(new Error("unable to get local issuer certificate"), {
        name: "Error",
      }),
    );

    const res = await makeCallbackRequest();
    expect(res.status).toBe(502);
  });

  it("returns 502 when GitHub token endpoint returns non-ok status", async () => {
    mockUndiciRequest.mockResolvedValue({
      statusCode: 500,
      body: {
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      },
      headers: {},
    } as never);
    const res = await makeCallbackRequest();
    expect(res.status).toBe(502);
  });

  it("returns 400 when GitHub returns an error in the token response", async () => {
    mockUndiciRequest.mockResolvedValue({
      statusCode: 200,
      body: {
        json: () =>
          Promise.resolve({
            error: "bad_verification_code",
            error_description: "The code passed is incorrect",
          }),
        text: () => Promise.resolve(""),
      },
      headers: {},
    } as never);
    const res = await makeCallbackRequest();
    expect(res.status).toBe(400);
  });

  it("creates a session and sets session cookie directly on success", async () => {
    const res = await makeCallbackRequest();
    expect(mockSessionCreate).toHaveBeenCalledWith("gha_token", "42");
    const cookies = res.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(sessionCookie).toContain("Max-Age=");
  });

  it("redirects to / on success (no relay)", async () => {
    const res = await makeCallbackRequest();
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toBe("/");
  });

  it("uses the shared undici agent for the token exchange", async () => {
    await makeCallbackRequest();
    expect(mockUndiciRequest).toHaveBeenCalled();
    // The call must include a dispatcher (the shared agent) — not rely on global fetch
    const callOptions = mockUndiciRequest.mock.calls[0]![1];
    expect(callOptions).toHaveProperty("dispatcher");
  });
});

// ── /auth/logout ───────────────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  it("clears the session cookie", async () => {
    mockVerifySession.mockResolvedValueOnce({
      sub: "42",
      sessionId: "s1",
      login: "octocat",
      name: "Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
    });
    const res = await makeApp().request("/auth/logout", {
      method: "POST",
      headers: { cookie: "session=some.jwt" },
    });
    const cookies = res.headers.getSetCookie();
    const cleared = cookies.find((c) => c.startsWith("session=;"));
    expect(cleared).toBeDefined();
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("SameSite=Strict");
  });

  it("destroys the server-side session", async () => {
    mockVerifySession.mockResolvedValueOnce({
      sub: "42",
      sessionId: "sid-to-destroy",
      login: "octocat",
      name: "Octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
    });
    await makeApp().request("/auth/logout", {
      method: "POST",
      headers: { cookie: "session=some.jwt" },
    });
    expect(mockSessionDestroy).toHaveBeenCalledWith("sid-to-destroy");
  });

  it("responds 200 even when session cookie is absent", async () => {
    const res = await makeApp().request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockSessionDestroy).not.toHaveBeenCalled();
  });

  it("responds 200 when JWT verification fails (already expired)", async () => {
    mockVerifySession.mockRejectedValueOnce(new Error("jwt expired"));
    const res = await makeApp().request("/auth/logout", {
      method: "POST",
      headers: { cookie: "session=bad.jwt" },
    });
    expect(res.status).toBe(200);
    expect(mockSessionDestroy).not.toHaveBeenCalled();
  });
});

// ── getCookie helper ──────────────────────────────────────────────────────────

describe("getCookie", () => {
  it("returns the value of a named cookie", () => {
    expect(getCookie("session=abc; other=xyz", "session")).toBe("abc");
  });

  it("handles cookie values containing =", () => {
    expect(getCookie("token=a=b=c; other=1", "token")).toBe("a=b=c");
  });

  it("returns undefined for missing cookie name", () => {
    expect(getCookie("session=abc", "missing")).toBeUndefined();
  });

  it("returns undefined for empty cookie header", () => {
    expect(getCookie(undefined, "session")).toBeUndefined();
  });

  it("handles whitespace around cookie pairs", () => {
    expect(getCookie("  foo=bar  ;  baz=qux  ", "baz")).toBe("qux");
  });
});
