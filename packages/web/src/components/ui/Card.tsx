import type { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
}

interface CardHeaderProps {
  title: string
  actions?: ReactNode
}

export function Card({ children, className }: CardProps) {
  return <div className={`card ${className ?? ""}`}>{children}</div>
}

export function CardHeader({ title, actions }: CardHeaderProps) {
  return (
    <div className="card-header">
      <span className="card-title">{title}</span>
      {actions}
    </div>
  )
}
