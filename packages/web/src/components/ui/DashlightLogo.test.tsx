import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { DashlightLogo } from "./DashlightLogo.js"

describe("DashlightLogo", () => {
  it("renders an SVG element", () => {
    const { container } = render(<DashlightLogo />)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("uses the default size of 20 when no size is provided", () => {
    const { container } = render(<DashlightLogo />)
    const svg = container.querySelector("svg")!
    expect(svg.getAttribute("width")).toBe("20")
    expect(svg.getAttribute("height")).toBe("20")
  })

  it("applies a custom size to width and height", () => {
    const { container } = render(<DashlightLogo size={48} />)
    const svg = container.querySelector("svg")!
    expect(svg.getAttribute("width")).toBe("48")
    expect(svg.getAttribute("height")).toBe("48")
  })

  it("has aria-label set to Dashlight", () => {
    const { container } = render(<DashlightLogo />)
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Dashlight")
  })

  it("keeps a square viewBox regardless of size", () => {
    const { container } = render(<DashlightLogo size={64} />)
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 100 100")
  })
})
