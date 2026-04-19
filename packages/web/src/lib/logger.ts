/**
 * Browser logger. Outputs structured JSON objects to the console, filtered by
 * log level. Reads VITE_LOG_LEVEL at build time; defaults to "debug" in dev
 * and "warn" in production.
 *
 * Level hierarchy (lowest → highest): debug < info < warn < error
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function resolveLevel(): LogLevel {
  const raw = import.meta.env["VITE_LOG_LEVEL"]?.toLowerCase() as LogLevel | undefined
  if (raw && raw in LEVEL_RANK) return raw
  return import.meta.env.DEV ? "debug" : "warn"
}

const minRank = LEVEL_RANK[resolveLevel()]

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < minRank) return
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  }
  console[level === "debug" ? "debug" : level](entry)
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info:  (message: string, context?: Record<string, unknown>) => write("info",  message, context),
  warn:  (message: string, context?: Record<string, unknown>) => write("warn",  message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
}
