# Tests (mandatory)
- Load tests with synthetic event volume
- Compatibility tests across versions
- Verify determinism across platforms (Windows/macOS/Linux)
- Comprehensive test pyramid integrated into CI:
  - unit + integration tests for `packages/*` and `apps/ui` (Vitest)
  - API route tests (Next.js) against fixtures
  - CLI integration tests (spawn `git a5c` in temp repos) + snapshot stdout
  - E2E tests for UI (Playwright) covering core flows (read + write where supported)
- Coverage:
  - collect coverage in CI, publish report artifacts, and enforce a minimum threshold
- Static checks:
  - ESLint, formatting, and TypeScript typecheck in CI and locally (pre-commit)


