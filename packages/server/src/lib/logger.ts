/**
 * Structured JSON logger. Outputs one JSON line per call to stdout (info/debug)
 * or stderr (warn/error). Respects the LOG_LEVEL environment variable.
 *
 * Level hierarchy (lowest → highest): debug < info < warn < error
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function resolveLevel(): LogLevel {
  const raw = process.env["LOG_LEVEL"]?.toLowerCase()
  if (raw && raw in LEVEL_RANK) return raw as LogLevel
  return "info"
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
  const line = JSON.stringify(entry) + "\n"
  if (level === "warn" || level === "error") {
    process.stderr.write(line)
  } else {
    process.stdout.write(line)
  }
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info:  (message: string, context?: Record<string, unknown>) => write("info",  message, context),
  warn:  (message: string, context?: Record<string, unknown>) => write("warn",  message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
}

