import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ThemeProvider } from "../context/ThemeContext.js"
import type { SessionUser } from "../types/index.js"
import type { QueryClient } from "@tanstack/react-query"

export interface RouterContext {
  queryClient: QueryClient
  user: SessionUser | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <ThemeProvider>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </ThemeProvider>
  )
}
