import { useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react"
import dagre from "@dagrejs/dagre"
import { runStatusVariant } from "../../lib/utils.js"
import type { WorkflowJob } from "../../types/index.js"
import "@xyflow/react/dist/style.css"

interface WorkflowDAGProps {
  jobs: WorkflowJob[]
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 40

export function WorkflowDAG({ jobs }: WorkflowDAGProps) {
  const { nodes, edges } = useMemo(() => layoutJobs(jobs), [jobs])

  if (nodes.length === 0) {
    return <p className="empty-state">No jobs to display.</p>
  }

  return (
    <div style={{ height: Math.max(200, nodes.length * 60), borderRadius: "var(--radius)", overflow: "hidden" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

function layoutJobs(jobs: WorkflowJob[]): { nodes: Node[]; edges: Edge[] } {
  if (jobs.length === 0) return { nodes: [], edges: [] }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 20, ranksep: 40 })

  for (const job of jobs) {
    g.setNode(String(job.id), { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Infer dependencies from step ordering (jobs don't explicitly list deps in the API)
  // In practice this just displays jobs in parallel layout since GitHub doesn't expose deps
  // A future improvement: parse workflow YAML to extract `needs` keys
  dagre.layout(g)

  const nodes: Node[] = jobs.map((job) => {
    const nodeWithPos = g.node(String(job.id))
    const variant = runStatusVariant(job.status, job.conclusion)
    const colorMap: Record<string, string> = {
      success: "var(--color-success)",
      failure: "var(--color-failure)",
      running: "var(--color-running)",
      cancelled: "var(--color-cancelled)",
      neutral: "var(--color-neutral)",
      pending: "var(--color-neutral)",
    }
    return {
      id: String(job.id),
      position: { x: nodeWithPos.x - NODE_WIDTH / 2, y: nodeWithPos.y - NODE_HEIGHT / 2 },
      data: { label: job.name },
      style: {
        background: "var(--color-bg-secondary)",
        border: `2px solid ${colorMap[variant] ?? "var(--color-border)"}`,
        borderRadius: "var(--radius)",
        padding: "0.375rem 0.75rem",
        fontSize: 12,
        fontWeight: 500,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
    }
  })

  return { nodes, edges: [] }
}
