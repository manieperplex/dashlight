export function EventBadge({ event }: { event: string }) {
  return <span className={`badge ${eventBadgeClass(event)}`}>{eventLabel(event)}</span>
}

function eventLabel(event: string): string {
  switch (event) {
    case "push": return "push"
    case "pull_request":
    case "pull_request_target": return "PR"
    case "workflow_dispatch": return "manual"
    case "schedule": return "schedule"
    case "workflow_call": return "called"
    case "release": return "release"
    default: return event
  }
}

function eventBadgeClass(event: string): string {
  switch (event) {
    case "push": return "badge-push"
    case "pull_request":
    case "pull_request_target": return "badge-pr"
    case "workflow_dispatch": return "badge-manual"
    case "schedule": return "badge-schedule"
    default: return "badge-neutral"
  }
}
