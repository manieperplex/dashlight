import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { queryClient, persister, PERSIST_MAX_AGE } from "./lib/queryClient.js"
import { routeTree } from "./routeTree.gen.js"
import "./styles/globals.css"

const router = createRouter({
  routeTree,
  context: {
    queryClient,
    user: null,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        // Increment buster to discard IndexedDB data persisted before the
        // dehydrateOptions filter was added (which excluded auth queries).
        // Without this, users who loaded the app before the fix would still
        // have ["auth", "me"] in IndexedDB and bypass the password check on reload.
        buster: "v2",
        // Auth state must never be restored from IndexedDB — always verify with
        // the server on page load so that adding APP_PASSWORD or changing auth
        // mode takes effect immediately without requiring a manual cache clear.
        dehydrateOptions: {
          // "auth" must never be restored (avoids bypassing password check on reload).
          // "config" must never be restored (WATCH_WORKFLOWS may change between sessions).
          shouldDehydrateQuery: (query) =>
            query.queryKey[0] !== "auth" && query.queryKey[0] !== "config",
        },
      }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </React.StrictMode>
)

