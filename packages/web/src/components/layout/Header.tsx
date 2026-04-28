import { useState } from "react"
import { useIsFetching, useQueryClient, useQuery } from "@tanstack/react-query"
import { logout, clearServerCache, getAuthConfig } from "../../api/index.js"
import { Button } from "../ui/Button.js"
import { Spinner } from "../ui/Spinner.js"
import { useTheme } from "../../context/ThemeContext.js"
import type { SessionUser } from "../../types/index.js"

interface HeaderProps {
  user: SessionUser
  lastUpdated?: number | null
}

export function Header({ user, lastUpdated }: HeaderProps) {
  const isFetching = useIsFetching()
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const { theme, toggleTheme } = useTheme()

  const { data: authConfig } = useQuery({
    queryKey: ["auth", "config"],
    queryFn: getAuthConfig,
    // 5 min: re-check if auth mode changes (e.g. APP_PASSWORD added).
    // Not persisted to IndexedDB (auth queries are excluded — see main.tsx).
    staleTime: 5 * 60 * 1000,
    // On error (server unreachable) default to OAuth — safe: shows sign-out button
    retry: false,
  })

  const isPATOpenAccess = authConfig?.mode === "pat" && !authConfig.passwordRequired

  async function handleLogout() {
    await logout()
    window.location.href = "/login"
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await clearServerCache()
      await queryClient.invalidateQueries()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <header className="header">
      <div className="flex-center gap-2">
        {isFetching > 0 || syncing ? (
          <span className="flex-center gap-1 text-muted text-small">
            <Spinner /> {syncing ? "Syncing…" : "Refreshing…"}
          </span>
        ) : lastUpdated ? (
          <span className="text-muted text-small">
            Updated {new Date(lastUpdated).toLocaleTimeString(undefined, { timeStyle: "short" })}
          </span>
        ) : null}
      </div>
      <div className="flex-center gap-2">
        <button
          className="btn btn-sm sync-btn"
          onClick={handleSync}
          disabled={syncing}
          title="Clear cache and reload"
          aria-label="Sync"
        >
          <SyncIcon spinning={syncing} />
        </button>
        <button
          className="btn btn-sm"
          onClick={toggleTheme}
          title={theme === "dark" ? "Come to the bright side" : "Come to the dark side"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        {authConfig?.mode === "pat" && (
          <span className="badge badge-neutral text-small" title="Using shared GitHub token">
            Token
          </span>
        )}
        <img
          src={user.avatarUrl}
          alt={user.login}
          width={24}
          height={24}
          style={{ borderRadius: "50%", border: "1px solid var(--color-border)" }}
        />
        <span className="text-small" style={{ fontWeight: 500 }}>
          {user.login}
        </span>
        {!isPATOpenAccess && (
          <Button size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        )}
      </div>
    </header>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{
        display: "block",
        animation: spinning ? "spin 0.7s linear infinite" : undefined,
      }}
    >
      <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ display: "block" }}>
      <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ display: "block" }}>
      <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z" />
    </svg>
  )
}
