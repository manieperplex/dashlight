import { QueryClient } from "@tanstack/react-query"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { get, set, del } from "idb-keyval"
import { ApiError } from "../api/client.js"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,          // 5 min: serve cached data without refetching
      gcTime: 24 * 60 * 60 * 1000,       // 24 h: keep in memory (matches persister maxAge)
      // Don't retry on 401 — session is gone, redirect instead
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false
        return failureCount < 1
      },
    },
  },
  // Redirect to /login when any in-app query gets a 401 (session expired after login)
  mutationCache: undefined,
})

queryClient.getQueryCache().subscribe((event) => {
  if (
    event.type === "updated" &&
    event.action.type === "error" &&
    event.action.error instanceof ApiError &&
    event.action.error.status === 401 &&
    window.location.pathname !== "/login"
  ) {
    window.location.href = "/login"
  }
})

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key: string) => get<string>(key),
    setItem: (key: string, value: string) => set(key, value),
    removeItem: (key: string) => del(key),
  },
  throttleTime: 1000,  // Batch IndexedDB writes
})

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000  // 24 h
