import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider, useTheme } from "./ThemeContext.js"

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe("ThemeProvider", () => {
  it("defaults to dark when matchMedia prefers dark", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    expect(screen.getByTestId("theme").textContent).toBe("dark")
  })

  it("defaults to light when matchMedia prefers light", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    expect(screen.getByTestId("theme").textContent).toBe("light")
  })

  it("restores stored theme from localStorage", () => {
    localStorage.setItem("dashlight-theme", "light")
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) // would default dark
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    expect(screen.getByTestId("theme").textContent).toBe("light")
  })

  it("toggleTheme switches from dark to light", () => {
    localStorage.setItem("dashlight-theme", "dark")
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    fireEvent.click(screen.getByRole("button", { name: "toggle" }))
    expect(screen.getByTestId("theme").textContent).toBe("light")
  })

  it("toggleTheme switches from light to dark", () => {
    localStorage.setItem("dashlight-theme", "light")
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    fireEvent.click(screen.getByRole("button", { name: "toggle" }))
    expect(screen.getByTestId("theme").textContent).toBe("dark")
  })

  it("sets data-theme attribute on documentElement", () => {
    localStorage.setItem("dashlight-theme", "dark")
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("persists theme to localStorage on toggle", () => {
    localStorage.setItem("dashlight-theme", "dark")
    render(<ThemeProvider><ThemeConsumer /></ThemeProvider>)
    fireEvent.click(screen.getByRole("button", { name: "toggle" }))
    expect(localStorage.getItem("dashlight-theme")).toBe("light")
  })
})

describe("useTheme outside provider", () => {
  it("throws when used outside ThemeProvider", () => {
    const original = console.error
    console.error = () => {}
    expect(() => render(<ThemeConsumer />)).toThrow("useTheme must be used within ThemeProvider")
    console.error = original
  })
})
