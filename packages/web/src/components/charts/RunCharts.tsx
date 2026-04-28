import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts"
import type { WorkflowRun } from "../../types/index.js"

// ── Palette ───────────────────────────────────────────────────────────────────

const PALETTE = [
  "#0969da",
  "#1a7f37",
  "#cf222e",
  "#9a6700",
  "#8250df",
  "#d6409f",
  "#0a3069",
  "#116329",
]

export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0]!
}

// ── RepoActivityChart ─────────────────────────────────────────────────────────

type DayEntry = Record<string, string | number> & { date: string }

function buildActivityData(
  repoRuns: Array<{ name: string; fullName: string; runs: WorkflowRun[] }>,
  days = 30
): { data: DayEntry[]; activeRepos: Array<{ name: string; fullName: string }> } {
  const now = Date.now()
  const windowMs = days * 86_400_000

  // Build ordered date labels
  const labels: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000)
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }))
  }

  // Count runs per repo per day; track which repos have any activity
  const counts = new Map<string, Map<string, number>>()
  const hasActivity = new Set<string>()

  for (const { name, runs } of repoRuns) {
    const perDay = new Map<string, number>()
    for (const run of runs) {
      const age = now - new Date(run.createdAt).getTime()
      if (age > windowMs) continue
      const label = new Date(run.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
      perDay.set(label, (perDay.get(label) ?? 0) + 1)
      hasActivity.add(name)
    }
    counts.set(name, perDay)
  }

  const activeRepos = repoRuns
    .filter(({ name }) => hasActivity.has(name))
    .map(({ name, fullName }) => ({ name, fullName }))

  const data: DayEntry[] = labels.map((date) => {
    const entry: DayEntry = { date }
    for (const { name } of activeRepos) {
      entry[name] = counts.get(name)?.get(date) ?? 0
    }
    return entry
  })

  return { data, activeRepos }
}

export interface RepoRunEntry {
  name: string       // short repo name
  fullName: string   // owner/repo
  runs: WorkflowRun[]
}

export function RepoActivityChart({ repoRuns }: { repoRuns: RepoRunEntry[] }) {
  const { data, activeRepos } = buildActivityData(repoRuns)

  if (activeRepos.length === 0) {
    return (
      <p className="text-muted text-small" style={{ padding: "2rem 0", textAlign: "center" }}>
        No run activity in the last 30 days.
      </p>
    )
  }

  const xInterval = Math.floor(30 / 5)

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
            interval={xInterval}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={28}
            tickCount={4}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
            }}
            labelStyle={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: "var(--color-text-secondary)" }}
            formatter={(value: unknown, name: unknown) => [value as number, name as string]}
          />
          {activeRepos.map(({ name }, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={paletteColor(i)}
              strokeWidth={1.5}
              strokeDasharray="0 3"
              strokeLinecap="square"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="activity-chart-legend">
        {activeRepos.map(({ name }, i) => (
          <span key={name} className="activity-chart-legend-item">
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <circle cx="4" cy="4" r="4" fill={paletteColor(i)} />
            </svg>
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function groupByDay(runs: WorkflowRun[], days = 14) {
  const now = Date.now()
  const map = new Map<string, { success: number; failure: number; cancelled: number }>()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000)
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    map.set(key, { success: 0, failure: 0, cancelled: 0 })
  }

  for (const run of runs) {
    const d = new Date(run.createdAt)
    if (now - d.getTime() > days * 86_400_000) continue
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    const entry = map.get(key)
    if (!entry) continue
    if (run.conclusion === "success") entry.success++
    else if (run.conclusion === "failure" || run.conclusion === "timed_out") entry.failure++
    else if (run.conclusion === "cancelled") entry.cancelled++
  }

  return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }))
}

function durationTrendData(runs: WorkflowRun[]) {
  return runs
    .filter((r) => r.runStartedAt && r.status === "completed")
    .slice(0, 40)
    .reverse()
    .map((r) => {
      const start = new Date(r.runStartedAt!).getTime()
      const end = new Date(r.updatedAt).getTime()
      const durationSec = Math.max(0, Math.floor((end - start) / 1000))
      return {
        name: `#${r.runNumber}`,
        duration: durationSec,
        conclusion: r.conclusion,
      }
    })
}

function fmtSec(v: number): string {
  if (v < 60) return `${v}s`
  const m = Math.floor(v / 60)
  const s = v % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ── Shared tooltip style ──────────────────────────────────────────────────────

const tooltipStyle = {
  fontSize: 12,
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  boxShadow: "var(--shadow-sm)",
}
const tooltipLabelStyle = { color: "var(--color-text)", fontWeight: 600 }
const axisTickStyle = { fontSize: 10, fill: "var(--color-text-secondary)" }

// ── BuildTrendChart ───────────────────────────────────────────────────────────

export function BuildTrendChart({ runs }: { runs: WorkflowRun[] }) {
  const data = groupByDay(runs, 14)
  const hasData = data.some((d) => d.success + d.failure + d.cancelled > 0)

  if (!hasData) {
    return (
      <p className="text-muted text-small" style={{ padding: "1.5rem 0", textAlign: "center" }}>
        Not enough data yet — runs will appear here as they complete.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={axisTickStyle}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={axisTickStyle}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={{ color: "var(--color-text-secondary)" }}
        />
        <Bar dataKey="success" stackId="a" fill="#1a7f37" name="Success" />
        <Bar dataKey="failure" stackId="a" fill="#cf222e" name="Failure" />
        <Bar
          dataKey="cancelled"
          stackId="a"
          fill="#8b949e"
          name="Cancelled"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── DurationChart ─────────────────────────────────────────────────────────────

export function DurationChart({ runs }: { runs: WorkflowRun[] }) {
  const data = durationTrendData(runs)

  if (data.length < 3) {
    return (
      <p className="text-muted text-small" style={{ padding: "1.5rem 0", textAlign: "center" }}>
        Not enough completed runs to show duration trend.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="durationGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0969da" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#0969da" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={axisTickStyle}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmtSec}
          tick={axisTickStyle}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip
          formatter={(value: unknown) => [fmtSec(value as number), "Duration"]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={{ color: "var(--color-text-secondary)" }}
        />
        <Area
          type="monotone"
          dataKey="duration"
          stroke="#0969da"
          strokeWidth={2}
          fill="url(#durationGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#0969da" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
