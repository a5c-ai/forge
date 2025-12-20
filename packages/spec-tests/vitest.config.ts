import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["test/**", "**/*.d.ts"],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 85,
        lines: 80
      }
    }
  }
});


