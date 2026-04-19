import type { ReactNode } from "react"
import { Sidebar } from "./Sidebar.js"
import { Header } from "./Header.js"
import type { SessionUser } from "../../types/index.js"

interface LayoutProps {
  user: SessionUser
  children: ReactNode
}

export default function Layout({ user, children }: LayoutProps) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <Header user={user} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}
