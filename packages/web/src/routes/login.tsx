import { useState } from "react"
import { createFileRoute, redirect, isRedirect, useNavigate, useLoaderData } from "@tanstack/react-router"
import { getMe, getAuthConfig, patLogin } from "../api/index.js"
import { DashlightLogo } from "../components/ui/DashlightLogo.js"
import type { AuthConfig } from "../types/index.js"

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    // Already authenticated — go to dashboard
    try {
      await getMe()
      throw redirect({ to: "/" })
    } catch (err) {
      // Re-throw router redirects; swallow auth errors (show login page)
      if (isRedirect(err)) throw err
    }
  },
  loader: async (): Promise<AuthConfig> => {
    try {
      return await getAuthConfig()
    } catch {
      // Server unreachable — fall back to OAuth form, which also won't work
      // but avoids crashing the router and shows the user a sensible page.
      return { mode: "oauth", passwordRequired: false }
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const authConfig = useLoaderData({ from: "/login" }) as AuthConfig

  if (authConfig.mode === "pat" && authConfig.passwordRequired) {
    return <PATPasswordForm />
  }

  // OAuth mode (PAT+no-password never renders login since getMe() always succeeds)
  return <OAuthLoginPage />
}

function OAuthLoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <DashlightLogo size={40} />
          <span className="login-logo-name">Dashlight</span>
        </div>
        <a className="btn btn-primary btn-login" href="/auth/login">
          <svg width="20" height="20" viewBox="0 0 98 96" fill="currentColor" aria-hidden>
            <path d="M49 1C22.9 1 1 22.9 1 49c0 21.2 13.7 39.1 32.7 45.5 2.4.4 3.3-1 3.3-2.3 0-1.1 0-4.1-.1-8-13.3 2.9-16.1-6.4-16.1-6.4-2.2-5.5-5.3-7-5.3-7-4.3-3 .3-2.9.3-2.9 4.8.3 7.3 4.9 7.3 4.9 4.2 7.3 11.1 5.2 13.8 4 .4-3.1 1.7-5.2 3-6.4-10.6-1.2-21.8-5.3-21.8-23.6 0-5.2 1.9-9.5 4.9-12.8-.5-1.2-2.1-6.1.5-12.6 0 0 4-.3 13.1 4.9a45.1 45.1 0 0 1 24 0c9-5.1 13-4.9 13-4.9 2.6 6.5 1 11.4.5 12.6 3.1 3.4 4.9 7.6 4.9 12.8 0 18.3-11.2 22.4-21.9 23.5 1.7 1.5 3.3 4.4 3.3 8.9 0 6.4-.1 11.6-.1 13.2 0 1.3.8 2.8 3.3 2.3C83.3 88 97 70.1 97 49 97 22.9 75.1 1 49 1z" />
          </svg>
          Sign in with GitHub
        </a>
      </div>
    </div>
  )
}

function PATPasswordForm() {
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await patLogin(password)
      void navigate({ to: "/" })
    } catch {
      setError("Invalid password. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <DashlightLogo size={40} />
          <span className="login-logo-name">Dashlight</span>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            style={{
              padding: "0.5rem 0.75rem",
              fontSize: 14,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
          {error && (
            <p role="alert" style={{ color: "var(--color-danger, #e53e3e)", fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-login"
            disabled={loading || !password}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
