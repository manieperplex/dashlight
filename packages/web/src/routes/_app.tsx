import { createFileRoute, redirect, Outlet } from "@tanstack/react-router"
import { getMe } from "../api/index.js"
import Layout from "../components/layout/Layout.js"
import type { SessionUser } from "../types/index.js"

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    let user: SessionUser
    try {
      user = await context.queryClient.fetchQuery({
        queryKey: ["auth", "me"],
        queryFn: getMe,
        staleTime: 5 * 60 * 1000,
      })
    } catch {
      throw redirect({ to: "/login" })
    }
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const { user } = Route.useRouteContext()
  return (
    <Layout user={user}>
      <Outlet />
    </Layout>
  )
}
