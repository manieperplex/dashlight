import type { ButtonHTMLAttributes, ReactNode } from "react"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger"
  size?: "sm" | "md"
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = "default",
  size = "md",
  loading = false,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    variant === "primary" ? "btn-primary" : "",
    variant === "danger" ? "btn-danger" : "",
    size === "sm" ? "btn-sm" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
      {children}
    </button>
  )
}
