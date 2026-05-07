import { LRUCache } from "lru-cache"
import { log } from "./logger.js"

// TTL constants in milliseconds
export const TTL = {
  runs: 2 * 60 * 1000,
  jobs: 2 * 60 * 1000,
  annotations: 5 * 60 * 1000,
  workflows: 10 * 60 * 1000,
  repos: 15 * 60 * 1000,
  orgs: 30 * 60 * 1000,
  runners: 5 * 60 * 1000,
  score: 24 * 60 * 60 * 1000,
  yaml: 7 * 24 * 60 * 60 * 1000,
  logs: 7 * 24 * 60 * 60 * 1000,
  default: 5 * 60 * 1000,
} as const

const _parsedCacheSize = parseInt(process.env["CACHE_MAX_SIZE_MB"] ?? "", 10)
const maxSizeMb = (!isNaN(_parsedCacheSize) && _parsedCacheSize > 0) ? _parsedCacheSize : 128
if (isNaN(_parsedCacheSize) || _parsedCacheSize <= 0) {
  log.warn("CACHE_MAX_SIZE_MB is invalid or not set — using default 128 MB", {
    raw: process.env["CACHE_MAX_SIZE_MB"],
  })
}
const maxSizeBytes = maxSizeMb * 1024 * 1024

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new LRUCache<string, any>({
  maxSize: maxSizeBytes,
  sizeCalculation: (value) => {
    try {
      return JSON.stringify(value).length * 2
    } catch (err) {
      log.warn("Cache sizeCalculation failed — using fallback size of 1024 bytes", { error: String(err) })
      return 1024
    }
  },
  ttl: TTL.default,
  allowStale: false,
})

export function cacheKey(userId: string, path: string): string {
  return `${userId}:${path}`
}

export function cacheGet<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined
}

export function cacheSet<T>(key: string, value: T, ttl: number): void {
  cache.set(key, value, { ttl })
}

export function cacheInvalidate(userId: string, prefix: string): void {
  const pattern = `${userId}:${prefix}`
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) {
      cache.delete(key)
    }
  }
}

/** Clear every cache entry belonging to a user. */
export function cacheInvalidateUser(userId: string): void {
  cacheInvalidate(userId, "")
}

export function cacheStats(): { size: number; maxSize: number; itemCount: number } {
  return {
    size: cache.calculatedSize ?? 0,
    maxSize: maxSizeBytes,
    itemCount: cache.size,
  }
}

// ---------------------------------------------------------------------------
// Stale store — persists { data, etag } for ETag-based conditional revalidation.
// Lives beyond the normal data TTL so a 304 response can restore stale data
// without a full re-fetch. Sized at 25% of the main cache budget.
// ---------------------------------------------------------------------------
const staleMaxSizeBytes = Math.max(Math.floor(maxSizeBytes / 4), 32 * 1024 * 1024)

export interface StaleEntry {
  data: unknown
  etag: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const staleCache = new LRUCache<string, any>({
  maxSize: staleMaxSizeBytes,
  sizeCalculation: (value) => {
    try {
      return JSON.stringify(value).length * 2
    } catch (err) {
      log.warn("Cache sizeCalculation failed — using fallback size of 1024 bytes", { error: String(err) })
      return 1024
    }
  },
  ttl: 24 * 60 * 60 * 1000, // 24 h — outlives all normal TTL windows
  allowStale: false,
})

export function staleGet(key: string): StaleEntry | undefined {
  return staleCache.get(key) as StaleEntry | undefined
}

export function staleSet(key: string, data: unknown, etag: string | null): void {
  staleCache.set(key, { data, etag } satisfies StaleEntry)
}

export function staleInvalidate(userId: string, prefix: string): void {
  const pattern = `${userId}:${prefix}`
  for (const key of staleCache.keys()) {
    if (key.startsWith(pattern)) {
      staleCache.delete(key)
    }
  }
}
