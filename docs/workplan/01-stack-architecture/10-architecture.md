# 0.2 Architecture
Monorepo (pnpm recommended):
- `packages/sdk` — pure library: parse, render, write events, verify
- `packages/cli` — `git-a5c` shim + commands
- `apps/ui` — Next.js UI
- `packages/server` — minimal HTTP API for remote mode
- `packages/agent` — workflow runner + hook installer
- `fixtures/` — golden repos for test vectors
- `spec/` — RFC + JSON schemas + canonical test vectors


