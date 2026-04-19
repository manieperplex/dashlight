import { Link } from "@tanstack/react-router"
import { DashlightLogo } from "../ui/DashlightLogo.js"

const navItems = [
  {
    to: "/",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z" />
      </svg>
    ),
  },
  {
    to: "/repositories",
    label: "Repositories",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z" />
      </svg>
    ),
  },
  {
    to: "/runs",
    label: "Runs",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0m4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z" />
      </svg>
    ),
  },
] as const

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <DashlightLogo size={20} />
        Dashlight
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
