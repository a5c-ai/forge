# a5cforge

Git-first, event-sourced collaboration for software teams. a5cforge keeps
issues, pull requests, agent signals, and operational events as tracked files
under `.collab/**`, so the entire collaboration graph travels with the Git
history.

## Highlights

- **Git is the database**: cloning a repo clones its collaboration state.
- **Event files, not rows**: every action appends an immutable `.collab/**`
  event file that follows documented JSON schemas.
- **Deterministic rendering**: the SDK produces a stable view from a
  `(treeish, inbox refs)` snapshot; no hidden state.
- **Inbox refs for intake**: optional refs let you stage proposals and
  async intake flows without touching main history immediately.
- **Clients you can mix & match**: the CLI (`git a5c`), local UI, and HTTP
  server all build on the same SDK, and outgoing webhooks let external
  automations react in real time.

## Quick Start

### Prerequisites

- Git
- Node.js 20+
- [pnpm](https://pnpm.io/) 9+

### Install dependencies

```bash
pnpm install
```

### One-command sandbox

`scripts/local-bringup.mjs` wires up a temporary repository, seeds sample
`.collab` events, builds the server and CLI (unless you skip it), and launches
both the API and the UI:

```bash
node scripts/local-bringup.mjs
```

Defaults:

- Seeded repo path is printed after start-up (or provide `--repo <path>`).
- Server listens on `http://127.0.0.1:3939` with bearer token `devtoken`.
- Next.js UI runs on `http://127.0.0.1:3000`.

Useful flags: `--skip-install`, `--skip-build`, `--no-seed`, `--server-port`,
`--ui-port`, `--token`. Run the script with `--help` for the full list.

### Explore with the CLI

```bash
pnpm -C packages/cli build
pnpm -C packages/cli link --global
git a5c status --repo <path-to-repo>
```

If `git a5c` is not found, add pnpm's global bin directory to your `PATH`.

### Run UI and server manually

```bash
# Server
pnpm -C packages/server build
PORT=3939 node packages/server/dist/bin/a5c-server.js

# UI (reads directly from a repo by default)
pnpm -C apps/ui dev
```

Configure the UI with environment variables such as `A5C_REPO`,
`A5C_TREEISH`, `A5C_INBOX_REFS`, and (for remote writes) `A5C_REMOTE_URL` and
`A5C_REMOTE_TOKEN`.

## Repository Layout

- `packages/sdk`: core rendering + writers for `.collab` events.
- `packages/cli`: `git a5c ...` commands built on the SDK.
- `packages/server`: HTTP API over a Git repo plus outgoing webhooks.
- `apps/ui`: Next.js UI for browsing and composing collaboration state.
- `spec/`: JSON schemas and test vectors.
- `fixtures/`: sample repositories used in tests.
- `scripts/`: operational tooling (including `local-bringup`).
- `docs/`: overview, guides, protocol, and architecture references.

## Development Workflow

Common workspace scripts:

- `pnpm build`: build every package that exposes a build script.
- `pnpm test`: run package tests (builds first when needed).
- `pnpm coverage`: run tests with coverage where supported.
- `pnpm lint` / `pnpm lint:fix`: lint the codebase with ESLint.
- `pnpm dupcheck`: duplication scan via `jscpd`.
- `pnpm docs:check`: markdown lint + link verification.

All commands are pnpm workspace-aware and run against the relevant packages.

## Documentation

- High-level overview: `docs/overview.md`
- Architecture tour: `docs/architecture/overview.md`
- Protocol specification: `docs/protocol/rfc-a5cforge-v1.md`
- CLI reference: `docs/cli/reference.md`
- Admin guide (server + remote mode): `docs/guides/admin-guide.md`
- Contributing guide: `docs/contributing.md`

## Contributing

Contributions are welcome! Start with `docs/contributing.md` for setup, repo
layout, and workflows for adding new event kinds. Please ensure `pnpm test`
and `pnpm lint` pass before opening a change.

---

_Project status: active development. Expect breaking changes while the v1
protocol and tooling are still under construction._
