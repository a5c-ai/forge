# 0.1 Language + tooling
- **Primary language:** TypeScript (Node.js)
  - SDK, CLI, UI backend, and server share one runtime.
- **UI:** Next.js (React) + Tailwind
  - Local mode: runs at `localhost`.
  - Remote mode: same UI served by a minimal API service.
- **Git access layer (SDK internal abstraction):**
  - Shell out to `git` for correctness and speed (`git cat-file`, `git ls-tree`, `git show`, `git rev-parse`).
- **Package manager:** pnpm
- **Test frameworks:**
  - Unit/integration: Vitest
  - CLI: Vitest + snapshot testing of stdout
  - E2E: Playwright (UI)


