import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["test/**", "**/*.d.ts"],
      thresholds: {
        statements: 65,
        branches: 55,
        functions: 70,
        lines: 65
      }
    }
  }
});


