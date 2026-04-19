import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/**/*.test.ts",
        // Environment-dependent (filesystem/proxy) — tested via integration
        "src/lib/certs.ts",
        // Untested wiring files
        "src/middleware/auth.ts",
        "src/middleware/access-log.ts",
        "src/middleware/security.ts",
        "src/routes/auth.ts",
        "src/routes/score.ts",
        "src/routes/system.ts",
      ],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
})
