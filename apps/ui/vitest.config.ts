import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Next/React Server Components marker import; stub for unit tests.
      "server-only": path.resolve(import.meta.dirname, "./test/__mocks__/server-only.ts")
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/e2e/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
    coverage: {
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "json-summary"],
      // Unit tests focus on API route handlers + server-side repo helpers.
      // We intentionally exclude React components/pages from unit coverage (covered by Playwright e2e).
      include: ["app/api/**/*.ts", "app/api/_lib/**/*.ts", "lib/serverRepo.ts"],
      exclude: ["e2e/**", "components/**", "app/**/page.tsx", "app/layout.tsx", "**/*.d.ts"]
    }
  }
});


