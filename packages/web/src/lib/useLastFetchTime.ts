import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { getLastGitHubFetchAt, subscribeLastGitHubFetchAt } from "../api/client.js"

interface LastFetchTime {
  lastFetchTime: number | null
  lastSyncTime: number | null
  recordSync: () => void
}

export function useLastFetchTime(): LastFetchTime {
  const lastFetchTime = useSyncExternalStore(subscribeLastGitHubFetchAt, getLastGitHubFetchAt)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [, setTick] = useState(0)

  // Tick every 15s so relative time display stays current
  useEffect(() => {
    if (lastFetchTime === null && lastSyncTime === null) return
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [lastFetchTime !== null || lastSyncTime !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const recordSync = useCallback(() => {
    setLastSyncTime(Date.now())
  }, [])

  return { lastFetchTime, lastSyncTime, recordSync }
}
