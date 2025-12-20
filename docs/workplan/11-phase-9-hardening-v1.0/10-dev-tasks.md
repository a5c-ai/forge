# Dev tasks
1. Performance:
   - enable snapshots/bundles defaults at scale
   - incremental scan (cache by treeish)
2. Verification:
   - implement ssh/gpg verifiers (optional)
   - policy evaluation (optional)
3. Docs:
   - adoption guide
   - repo conventions
4. Compatibility:
   - schema tests + forward-compat behavior
5. CI/CD + quality gates:
   - GitHub Actions workflows for the monorepo:
     - `ci`: lint + typecheck + unit/integration tests (workspace-wide)
     - `e2e`: Playwright smoke + e2e (UI) against local server(s)
     - `release`: version + changelog + publish packages (SDK/CLI/server) when tagged
     - `deploy` (optional): deploy UI/server for remote mode (staging/prod)
   - Matrix testing: Node LTS versions and OSes (Windows/macOS/Linux)
   - Caching: pnpm store cache + build/test caches where applicable
   - Artifacts: upload test reports, coverage, Playwright traces/screenshots on failure
   - PR protections: required checks, branch protection, and status checks on main
   - Pre-commit hooks: enforce eslint/format/typecheck on changed files; CI remains source of truth


