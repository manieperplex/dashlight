interface SpinnerProps {
  size?: "sm" | "lg"
  className?: string
}

export function Spinner({ size, className }: SpinnerProps) {
  return <span className={`spinner ${size === "lg" ? "spinner-lg" : ""} ${className ?? ""}`} />
}

export function PageSpinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
      <Spinner size="lg" />
    </div>
  )
}
