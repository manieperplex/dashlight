import { existsSync, readFileSync } from "node:fs";
import { request, EnvHttpProxyAgent } from "undici";
import { log } from "./logger.js";

const GITHUB_API_BASE = "https://api.github.com";

// Single shared agent for all outbound HTTPS — exported so auth.ts can reuse it.
//
// In this environment plain Node HTTPS picks up the extra CA bundle, but undici's
// EnvHttpProxyAgent does not reliably inherit it. Load the merged runtime CA bundle
// explicitly so outbound GitHub requests trust the same corporate MITM/root chain.
// Proxy env vars (HTTPS_PROXY, HTTP_PROXY, NO_PROXY) are still picked up automatically.
function loadAgentCa(): string | undefined {
  const caPath = process.env["SSL_CERT_FILE"];
  if (!caPath || !existsSync(caPath)) return undefined;
  return readFileSync(caPath, "utf8");
}

const agentCa = loadAgentCa();

export const agent = new EnvHttpProxyAgent(
  agentCa ? { connect: { ca: agentCa } } : {},
);

const RETRY_DELAYS_MS = [500, 1000, 2000];
// 429 is intentionally excluded: rate-limit windows are hourly, short retries are useless
// and amplify consumption. GitHubRateLimitError is thrown instead.
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export interface GitHubFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** If provided, sent as If-None-Match for a conditional GET (ETag revalidation). */
  etag?: string;
  /**
   * Follow a single HTTP 302 redirect and return the response body as raw text.
   * Needed for GitHub log endpoints which redirect to signed S3 URLs.
   */
  followRedirect?: boolean;
}

export interface GitHubFetchResult<T> {
  data: T;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  status: number;
  /** ETag returned by GitHub, if any. Store alongside cached data for future revalidation. */
  etag: string | null;
  /** OAuth scopes granted to this token — present on successful responses. */
  grantedScopes: string | null;
}

export async function githubFetch<T>(
  token: string,
  path: string,
  options: GitHubFetchOptions = {},
): Promise<GitHubFetchResult<T>> {
  const { method = "GET", body, signal, etag, followRedirect } = options;
  const effectiveSignal = signal ?? AbortSignal.timeout(30_000);
  const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 2000;
      await sleep(delay);
    }

    try {
      const response = await request(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "dashlight/1.0",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(etag ? { "If-None-Match": etag } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : null,
        dispatcher: agent,
        signal: effectiveSignal,
      });

      const status = response.statusCode;
      const rateLimitRemaining = parseIntHeader(
        response.headers["x-ratelimit-remaining"],
      );
      const rateLimitReset = parseIntHeader(
        response.headers["x-ratelimit-reset"],
      );
      const responseEtag = parseStringHeader(response.headers["etag"]);

      if (RETRYABLE_STATUS.has(status) && attempt < RETRY_DELAYS_MS.length) {
        await response.body.text(); // drain before retry
        lastError = new Error(`GitHub API returned ${status}`);
        continue;
      }

      // 304 Not Modified: free conditional response (0 quota points), no body
      if (status === 304) {
        await response.body.text(); // drain (usually empty)
        return {
          data: null as unknown as T,
          rateLimitRemaining,
          rateLimitReset,
          status: 304,
          etag: etag ?? null,
          grantedScopes: null,
        };
      }

      const text = await response.body.text();

      // 302 Redirect: follow to get actual content (e.g. log files on signed S3 URLs)
      if (status === 302) {
        if (!followRedirect) {
          throw new GitHubApiError(`Unexpected redirect for ${path}`, 302);
        }
        const location = parseStringHeader(response.headers["location"]);
        if (!location)
          throw new GitHubApiError(
            `302 redirect with no Location for ${path}`,
            502,
          );
        // Fetch the signed URL directly — no GitHub auth headers; S3 uses query-param sig
        const redirectResponse = await request(location, {
          method: "GET",
          dispatcher: agent,
          signal: effectiveSignal,
        });
        const redirectText = await redirectResponse.body.text();
        return {
          data: redirectText as unknown as T,
          rateLimitRemaining,
          rateLimitReset,
          status: redirectResponse.statusCode,
          etag: null,
          grantedScopes: null,
        };
      }

      // 429 Rate Limited: not retriable with short delays — throw immediately
      if (status === 429) {
        throw new GitHubRateLimitError(rateLimitReset);
      }

      if (status >= 400) {
        let message = `GitHub API error ${status}: ${path}`;
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          /* ignore */
        }
        const grantedScopes = parseStringHeader(
          response.headers["x-oauth-scopes"],
        );
        log.error("GitHub API error", { status, path, message, grantedScopes });
        if (status === 404) throw new GitHubNotFoundError(message);
        throw new GitHubApiError(message, status);
      }

      // 204 No Content
      if (status === 204 || !text) {
        return {
          data: null as unknown as T,
          rateLimitRemaining,
          rateLimitReset,
          status,
          etag: null,
          grantedScopes: null,
        };
      }

      const grantedScopes = parseStringHeader(
        response.headers["x-oauth-scopes"],
      );
      return {
        data: JSON.parse(text) as T,
        rateLimitRemaining,
        rateLimitReset,
        status,
        etag: responseEtag,
        grantedScopes,
      };
    } catch (err) {
      if (err instanceof GitHubApiError) throw err; // includes RateLimit + NotFound
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= RETRY_DELAYS_MS.length) break;
    }
  }

  throw lastError ?? new Error(`githubFetch failed after retries: ${path}`);
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubNotFoundError extends GitHubApiError {
  constructor(message: string) {
    super(message, 404);
    this.name = "GitHubNotFoundError";
  }
}

/** Thrown when GitHub returns 429. Not retriable with short backoff — reset is hourly. */
export class GitHubRateLimitError extends GitHubApiError {
  constructor(public readonly resetAt: number | null) {
    super("GitHub API rate limit exceeded", 429);
    this.name = "GitHubRateLimitError";
  }
}

function parseIntHeader(value: string | string[] | undefined): number | null {
  if (!value) return null;
  const str = Array.isArray(value) ? value[0] : value;
  const n = parseInt(str ?? "", 10);
  return isNaN(n) ? null : n;
}

function parseStringHeader(
  value: string | string[] | undefined,
): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
