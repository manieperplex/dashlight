import { describe, it, expect } from "vitest"
import { computeScore } from "./scorer.js"
import type { ScorerInput, GitHubRepo, GitHubWorkflow, GitHubWorkflowRun } from "./scorer.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    default_branch: "main",
    has_issues: true,
    has_wiki: true,
    has_discussions: false,
    open_issues_count: 5,
    pushed_at: new Date().toISOString(),
    topics: ["typescript", "react"],
    visibility: "public",
    license: { spdx_id: "MIT" },
    stargazers_count: 50,
    ...overrides,
  }
}

function makeWorkflow(id: number, name: string, state = "active"): GitHubWorkflow {
  return { id, name, state, path: `.github/workflows/${name.toLowerCase()}.yml` }
}

function makeRun(id: number, conclusion: string | null = "success", attempt = 1): GitHubWorkflowRun {
  return {
    id,
    status: conclusion !== null ? "completed" : "in_progress",
    conclusion,
    head_branch: "main",
    created_at: new Date().toISOString(),
    run_attempt: attempt,
  }
}

function makeInput(overrides: Partial<ScorerInput> = {}): ScorerInput {
  return {
    owner: "acme",
    repo: "my-app",
    repoData: makeRepo(),
    workflows: [
      makeWorkflow(1, "CI"),
      makeWorkflow(2, "Deploy"),
    ],
    recentRuns: Array.from({ length: 20 }, (_, i) => makeRun(i, "success")),
    hasReadme: true,
    hasDependabot: true,
    hasCodeql: true,
    hasSecurityPolicy: false,
    ...overrides,
  }
}

// ── Structure ─────────────────────────────────────────────────────────────────

describe("computeScore — structure", () => {
  it("returns owner and repo from input", () => {
    const result = computeScore(makeInput())
    expect(result.owner).toBe("acme")
    expect(result.repo).toBe("my-app")
  })

  it("returns exactly 5 categories", () => {
    const result = computeScore(makeInput())
    expect(result.categories).toHaveLength(5)
  })

  it("returns categories: Build Success Rate, CI/CD Workflows, Documentation, Maintenance, Security", () => {
    const result = computeScore(makeInput())
    const names = result.categories.map((c) => c.name)
    expect(names).toContain("Build Success Rate")
    expect(names).toContain("CI/CD Workflows")
    expect(names).toContain("Documentation")
    expect(names).toContain("Maintenance")
    expect(names).toContain("Security Practices")
    expect(names).not.toContain("Community Health")
    expect(names).not.toContain("Branch Protection")
  })

  it("returns a computedAt ISO timestamp", () => {
    const result = computeScore(makeInput())
    expect(() => new Date(result.computedAt)).not.toThrow()
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("overall is between 0 and 100", () => {
    const result = computeScore(makeInput())
    expect(result.overall).toBeGreaterThanOrEqual(0)
    expect(result.overall).toBeLessThanOrEqual(100)
  })

  it("each category has maxScore of 100", () => {
    const result = computeScore(makeInput())
    for (const cat of result.categories) {
      expect(cat.maxScore).toBe(100)
    }
  })

  it("each category score is between 0 and 100", () => {
    const result = computeScore(makeInput())
    for (const cat of result.categories) {
      expect(cat.score).toBeGreaterThanOrEqual(0)
      expect(cat.score).toBeLessThanOrEqual(100)
    }
  })
})

// ── Tier thresholds ───────────────────────────────────────────────────────────

describe("computeScore — tier thresholds", () => {
  it("well-configured repo is at least silver", () => {
    const result = computeScore(makeInput())
    expect(result.overall).toBeGreaterThanOrEqual(70)
    expect(["gold", "silver"]).toContain(result.tier)
  })

  it("returns bronze for minimal input", () => {
    const result = computeScore(makeInput({
      workflows: [],
      recentRuns: [],
      hasReadme: false,
      hasDependabot: false,
      hasCodeql: false,
      repoData: makeRepo({
        topics: [],
        license: null,
        has_wiki: false,
        pushed_at: "2020-01-01T00:00:00Z",
        open_issues_count: 200,
      }),
    }))
    expect(result.tier).toBe("bronze")
    expect(result.overall).toBeLessThan(70)
  })

  it("tier is gold when overall >= 90", () => {
    const result = computeScore(makeInput({
      recentRuns: Array.from({ length: 30 }, (_, i) => makeRun(i, "success")),
    }))
    if (result.overall >= 90) expect(result.tier).toBe("gold")
    else if (result.overall >= 70) expect(result.tier).toBe("silver")
    else expect(result.tier).toBe("bronze")
  })

  it("tier is silver when overall is between 70 and 89", () => {
    expect(computeScore(makeInput()).tier).not.toBe("bronze")
  })
})

// ── Build Success Rate ────────────────────────────────────────────────────────

describe("computeScore — build success rate", () => {
  it("all-passing runs score higher than all-failing runs", () => {
    const passing = computeScore(makeInput({
      recentRuns: Array.from({ length: 10 }, (_, i) => makeRun(i, "success")),
    }))
    const failing = computeScore(makeInput({
      recentRuns: Array.from({ length: 10 }, (_, i) => makeRun(i, "failure")),
    }))
    expect(passing.overall).toBeGreaterThan(failing.overall)
  })

  it("penalises high flakiness (run_attempt > 1)", () => {
    const flaky = computeScore(makeInput({
      recentRuns: Array.from({ length: 10 }, (_, i) => makeRun(i, "success", 2)),
    }))
    const clean = computeScore(makeInput({
      recentRuns: Array.from({ length: 10 }, (_, i) => makeRun(i, "success", 1)),
    }))
    expect(clean.overall).toBeGreaterThanOrEqual(flaky.overall)
  })

  it("build success category scores low with no runs", () => {
    const result = computeScore(makeInput({ recentRuns: [] }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    expect(cat.score).toBeLessThan(50)
  })

  it("95%+ success rate passes all three success-rate checks", () => {
    const result = computeScore(makeInput({
      recentRuns: Array.from({ length: 20 }, (_, i) => makeRun(i, "success")),
    }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    const checks = cat.checks.filter((c) => c.name.startsWith("Success rate"))
    expect(checks.every((c) => c.passed)).toBe(true)
  })

  it("50% success rate fails all three success-rate checks", () => {
    const runs = [
      ...Array.from({ length: 5 }, (_, i) => makeRun(i, "success")),
      ...Array.from({ length: 5 }, (_, i) => makeRun(i + 5, "failure")),
    ]
    const result = computeScore(makeInput({ recentRuns: runs }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    const checks = cat.checks.filter((c) => c.name.startsWith("Success rate"))
    expect(checks.every((c) => !c.passed)).toBe(true)
  })

  it("excludes cancelled runs from the success rate denominator", () => {
    // 12 success + 2 cancelled → 12/12 = 100%, not 12/14 = 85.7%
    const runs = [
      ...Array.from({ length: 12 }, (_, i) => makeRun(i, "success")),
      ...Array.from({ length: 2 }, (_, i) => makeRun(i + 12, "cancelled")),
    ]
    const result = computeScore(makeInput({ recentRuns: runs }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    const checks = cat.checks.filter((c) => c.name.startsWith("Success rate"))
    expect(checks.every((c) => c.passed)).toBe(true)
  })

  it("excludes skipped and neutral runs from the success rate denominator", () => {
    const runs = [
      ...Array.from({ length: 10 }, (_, i) => makeRun(i, "success")),
      makeRun(10, "skipped"),
      makeRun(11, "neutral"),
      makeRun(12, "stale"),
    ]
    const result = computeScore(makeInput({ recentRuns: runs }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    const checks = cat.checks.filter((c) => c.name.startsWith("Success rate"))
    expect(checks.every((c) => c.passed)).toBe(true)
  })

  it("cancelled-only runs do not earn the 'Has recent runs' point", () => {
    const result = computeScore(makeInput({
      recentRuns: Array.from({ length: 5 }, (_, i) => makeRun(i, "cancelled")),
    }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    const check = cat.checks.find((c) => c.name === "Has recent runs")!
    expect(check.passed).toBe(false)
  })

  it("flakiness ratio uses completed runs as denominator, not total runs", () => {
    // 1 successful non-flaky run + 9 cancelled: flakyRatio = 0/1 = 0%, not 0/10
    const runs = [
      makeRun(0, "success", 1),
      ...Array.from({ length: 9 }, (_, i) => makeRun(i + 1, "cancelled")),
    ]
    const result = computeScore(makeInput({ recentRuns: runs }))
    const cat = result.categories.find((c) => c.name === "Build Success Rate")!
    const check = cat.checks.find((c) => c.name === "Low flakiness (< 10% reruns)")!
    expect(check.passed).toBe(true)
    expect(check.value).toBe("0%")
  })

  it("all-cancelled runs score the same as no runs on success rate checks", () => {
    const allCancelled = computeScore(makeInput({
      recentRuns: Array.from({ length: 10 }, (_, i) => makeRun(i, "cancelled")),
    }))
    const noRuns = computeScore(makeInput({ recentRuns: [] }))
    const catCancelled = allCancelled.categories.find((c) => c.name === "Build Success Rate")!
    const catEmpty = noRuns.categories.find((c) => c.name === "Build Success Rate")!
    // Both should fail all three success-rate checks (rate = 0)
    const cancelledChecks = catCancelled.checks.filter((c) => c.name.startsWith("Success rate"))
    const emptyChecks = catEmpty.checks.filter((c) => c.name.startsWith("Success rate"))
    expect(cancelledChecks.every((c) => !c.passed)).toBe(true)
    expect(emptyChecks.every((c) => !c.passed)).toBe(true)
  })
})

// ── CI/CD Workflows ───────────────────────────────────────────────────────────

describe("computeScore — CI/CD workflows", () => {
  it("detects test workflow by name pattern", () => {
    const result = computeScore(makeInput({
      workflows: [makeWorkflow(1, "Run Tests"), makeWorkflow(2, "Deploy")],
    }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    const check = cat.checks.find((c) => c.name === "Has test/CI workflow")!
    expect(check.passed).toBe(true)
  })

  it("detects CI workflow by path pattern", () => {
    const wf: GitHubWorkflow = { id: 1, name: "Build", state: "active", path: ".github/workflows/ci.yml" }
    const result = computeScore(makeInput({ workflows: [wf] }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    const check = cat.checks.find((c) => c.name === "Has test/CI workflow")!
    expect(check.passed).toBe(true)
  })

  it("detects release workflow by name pattern", () => {
    const result = computeScore(makeInput({
      workflows: [makeWorkflow(1, "Release to Production")],
    }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    const check = cat.checks.find((c) => c.name === "Has release/deploy workflow")!
    expect(check.passed).toBe(true)
  })

  it("requires >= 2 active workflows for multiple-workflows check", () => {
    const one = computeScore(makeInput({ workflows: [makeWorkflow(1, "CI")] }))
    const two = computeScore(makeInput({ workflows: [makeWorkflow(1, "CI"), makeWorkflow(2, "Deploy")] }))
    const onecat = one.categories.find((c) => c.name === "CI/CD Workflows")!
    const twocat = two.categories.find((c) => c.name === "CI/CD Workflows")!
    const oneCheck = onecat.checks.find((c) => c.name === "Multiple workflows (>= 2)")!
    const twoCheck = twocat.checks.find((c) => c.name === "Multiple workflows (>= 2)")!
    expect(oneCheck.passed).toBe(false)
    expect(twoCheck.passed).toBe(true)
  })

  it("counts only active workflows", () => {
    const active = computeScore(makeInput({ workflows: [makeWorkflow(1, "CI", "active")] }))
    const inactive = computeScore(makeInput({ workflows: [makeWorkflow(1, "CI", "disabled_manually")] }))
    expect(active.overall).toBeGreaterThanOrEqual(inactive.overall)
  })

  it("dependabot satisfies dependency update check", () => {
    const result = computeScore(makeInput({
      workflows: [makeWorkflow(1, "CI")],
      hasDependabot: true,
    }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    const check = cat.checks.find((c) => c.name === "Has dependency update workflow")!
    expect(check.passed).toBe(true)
  })

  it("scores 0 with no workflows and no dependabot", () => {
    const result = computeScore(makeInput({ workflows: [], hasDependabot: false }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    expect(cat.score).toBe(0)
  })

  it("detects release workflow by path pattern", () => {
    const wf: GitHubWorkflow = { id: 1, name: "Ship it", state: "active", path: ".github/workflows/deploy.yml" }
    const result = computeScore(makeInput({ workflows: [wf] }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    const check = cat.checks.find((c) => c.name === "Has release/deploy workflow")!
    expect(check.passed).toBe(true)
  })

  it("workflow named 'Update Changelog' does not satisfy dependency update check", () => {
    const result = computeScore(makeInput({
      workflows: [makeWorkflow(1, "Update Changelog")],
      hasDependabot: false,
    }))
    const cat = result.categories.find((c) => c.name === "CI/CD Workflows")!
    const check = cat.checks.find((c) => c.name === "Has dependency update workflow")!
    expect(check.passed).toBe(false)
  })
})

// ── Security ──────────────────────────────────────────────────────────────────

describe("computeScore — security", () => {
  it("scores higher with dependabot and codeql", () => {
    const secure = computeScore(makeInput({ hasDependabot: true, hasCodeql: true }))
    const insecure = computeScore(makeInput({ hasDependabot: false, hasCodeql: false }))
    expect(secure.overall).toBeGreaterThan(insecure.overall)
  })

  it("private repo passes the 'private or has license' check", () => {
    const result = computeScore(makeInput({
      repoData: makeRepo({ visibility: "private", license: null }),
    }))
    const cat = result.categories.find((c) => c.name === "Security Practices")!
    const check = cat.checks.find((c) => c.name === "Private repo or has license")!
    expect(check.passed).toBe(true)
  })

  it("public repo without license fails the 'private or has license' check", () => {
    const result = computeScore(makeInput({
      repoData: makeRepo({ visibility: "public", license: null }),
    }))
    const cat = result.categories.find((c) => c.name === "Security Practices")!
    const check = cat.checks.find((c) => c.name === "Private repo or has license")!
    expect(check.passed).toBe(false)
  })

  it("security policy check reflects hasSecurityPolicy input", () => {
    const withPolicy = computeScore(makeInput({ hasSecurityPolicy: true }))
    const withoutPolicy = computeScore(makeInput({ hasSecurityPolicy: false }))
    const catWith = withPolicy.categories.find((c) => c.name === "Security Practices")!
    const catWithout = withoutPolicy.categories.find((c) => c.name === "Security Practices")!
    expect(catWith.checks.find((c) => c.name === "Has security policy (SECURITY.md)")!.passed).toBe(true)
    expect(catWithout.checks.find((c) => c.name === "Has security policy (SECURITY.md)")!.passed).toBe(false)
  })
})

// ── Documentation ─────────────────────────────────────────────────────────────

describe("computeScore — documentation", () => {
  it("scores higher with readme, topics, wiki, and license", () => {
    const full = computeScore(makeInput())
    const empty = computeScore(makeInput({
      hasReadme: false,
      repoData: makeRepo({ topics: [], has_wiki: false, has_discussions: false, license: null }),
    }))
    expect(full.overall).toBeGreaterThan(empty.overall)
  })

  it("missing README scores 0 on that check", () => {
    const result = computeScore(makeInput({ hasReadme: false }))
    const cat = result.categories.find((c) => c.name === "Documentation")!
    const check = cat.checks.find((c) => c.name === "Has README")!
    expect(check.passed).toBe(false)
  })

  it("topics count passes the topics check", () => {
    const result = computeScore(makeInput({
      repoData: makeRepo({ topics: ["api", "go"] }),
    }))
    const cat = result.categories.find((c) => c.name === "Documentation")!
    const check = cat.checks.find((c) => c.name === "Has topics/tags")!
    expect(check.passed).toBe(true)
    expect(check.value).toBe(2)
  })

  it("wiki satisfies the wiki-or-discussions check", () => {
    const result = computeScore(makeInput({
      repoData: makeRepo({ has_wiki: true, has_discussions: false }),
    }))
    const cat = result.categories.find((c) => c.name === "Documentation")!
    const check = cat.checks.find((c) => c.name === "Has wiki or discussions")!
    expect(check.passed).toBe(true)
  })
})

// ── Maintenance ───────────────────────────────────────────────────────────────

describe("computeScore — maintenance", () => {
  it("penalises repos not pushed in over 90 days", () => {
    const stale = computeScore(makeInput({
      repoData: makeRepo({ pushed_at: "2020-01-01T00:00:00Z" }),
    }))
    const fresh = computeScore(makeInput({
      repoData: makeRepo({ pushed_at: new Date().toISOString() }),
    }))
    expect(fresh.overall).toBeGreaterThan(stale.overall)
  })

  it("pushed within 30 days passes both push-recency checks", () => {
    const result = computeScore(makeInput({
      repoData: makeRepo({ pushed_at: new Date().toISOString() }),
    }))
    const cat = result.categories.find((c) => c.name === "Maintenance")!
    const within30 = cat.checks.find((c) => c.name === "Pushed within 30 days")!
    const within90 = cat.checks.find((c) => c.name === "Pushed within 90 days")!
    expect(within30.passed).toBe(true)
    expect(within90.passed).toBe(true)
  })

  it("pushed 60 days ago passes the 90-day check but not the 30-day check", () => {
    const d = new Date()
    d.setDate(d.getDate() - 60)
    const result = computeScore(makeInput({
      repoData: makeRepo({ pushed_at: d.toISOString() }),
    }))
    const cat = result.categories.find((c) => c.name === "Maintenance")!
    expect(cat.checks.find((c) => c.name === "Pushed within 30 days")!.passed).toBe(false)
    expect(cat.checks.find((c) => c.name === "Pushed within 90 days")!.passed).toBe(true)
  })

  it("penalises repos with many open issues/PRs", () => {
    const many = computeScore(makeInput({ repoData: makeRepo({ open_issues_count: 200 }) }))
    const few = computeScore(makeInput({ repoData: makeRepo({ open_issues_count: 2 }) }))
    expect(few.overall).toBeGreaterThanOrEqual(many.overall)
  })

  it("open issues/PRs check passes below 100 and fails at 100 or above", () => {
    const below = computeScore(makeInput({ repoData: makeRepo({ open_issues_count: 99 }) }))
    const atLimit = computeScore(makeInput({ repoData: makeRepo({ open_issues_count: 100 }) }))
    const catBelow = below.categories.find((c) => c.name === "Maintenance")!
    const catAt = atLimit.categories.find((c) => c.name === "Maintenance")!
    expect(catBelow.checks.find((c) => c.name === "Open issues/PRs < 100")!.passed).toBe(true)
    expect(catAt.checks.find((c) => c.name === "Open issues/PRs < 100")!.passed).toBe(false)
  })

  it("null pushed_at is treated as very stale", () => {
    const result = computeScore(makeInput({
      repoData: makeRepo({ pushed_at: null }),
    }))
    const cat = result.categories.find((c) => c.name === "Maintenance")!
    expect(cat.checks.find((c) => c.name === "Pushed within 30 days")!.passed).toBe(false)
    expect(cat.checks.find((c) => c.name === "Pushed within 90 days")!.passed).toBe(false)
  })
})
