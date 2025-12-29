import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/bin/**", "test/**", "**/*.d.ts"],
      thresholds: {
        statements: 55,
        branches: 45,
        functions: 65,
        lines: 55
      }
    }
  }
});


