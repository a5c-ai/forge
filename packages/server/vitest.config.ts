import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    coverage: {
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/bin/**", "test/**", "**/*.d.ts"],
      thresholds: {
        statements: 75,
        branches: 50,
        functions: 80,
        lines: 75
      }
    }
  }
});


