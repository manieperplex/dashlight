import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { tanstackRouter } from "@tanstack/router-vite-plugin"

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tanstackRouter(),
  ],
  server: {
    port: 5174,
    proxy: {
      "/auth": {
        target: "http://localhost:8080",
        // No changeOrigin — preserve Host: localhost:5174 so the server builds
        // redirect_uri pointing back to Vite, not directly to :8080.
      },
      "/proxy": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/system": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor"
          if (id.includes("node_modules/@tanstack/react-query")) return "query-vendor"
          if (id.includes("node_modules/@tanstack/react-router")) return "router-vendor"
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/routeTree.gen.ts",
        "src/main.tsx",
        "src/test-setup.ts",
        "src/**/*.test.{ts,tsx}",
        "src/routes/**",
        // API wiring — depends on server; client.ts is tested separately
        "src/api/index.ts",
        // Pure config / type-only files
        "src/lib/queryClient.ts",
        "src/types/**",
        "src/components/ui/index.ts",
        // Canvas-dependent or router-bound components
        "src/components/charts/**",
        "src/components/dag/**",
        "src/components/layout/**",
      ],
      thresholds: { lines: 70, functions: 70, branches: 60 },
    },
  },
}))
