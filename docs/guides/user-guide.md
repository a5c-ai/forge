# User guide (start here)

**Audience:** users  
**Status:** draft

This guide focuses on **getting a working local setup** and then using the system via CLI + UI.

If you want the concepts first, read: `docs/overview.md`.

## Prerequisites

- Node.js (see CI matrix in `.github/workflows/ci.yml`)
- pnpm
- git

## Fast path: run everything locally (temp repo + server + UI)

This repo includes a bring-up script that creates a temporary Git repo, seeds `.collab/**`, and starts the server + UI wired together.

From the repo root:

```bash
pnpm install
node scripts/local-bringup.mjs
```

It prints:

- the temp **repo path**
- the **server URL**
- the **UI URL**

Stop everything with `Ctrl+C`.

Helpful options:

```bash
node scripts/local-bringup.mjs --help
```

## What should I do next?

### 1) Use the UI

Open the printed UI URL. You should see an `issue-1` seeded by the script.

If you use a local repo (not the temp one), set `A5C_REPO` before starting UI:

```bash
export A5C_REPO=/path/to/repo
pnpm -C apps/ui dev
```

On PowerShell:

```powershell
$env:A5C_REPO="C:\path\to\repo"
pnpm -C apps/ui dev
```

### 2) Use the CLI

The canonical CLI reference is: `docs/cli/reference.md`.

Install the CLI so that `git-a5c` is on your `PATH` (Git discovers it as `git a5c`):

```bash
pnpm -C packages/cli build
pnpm -C packages/cli link --global
git a5c help
```

If `git a5c` is not found, ensure pnpm's global bin dir is on your `PATH` (run `pnpm setup` or add the directory printed by `pnpm bin -g`).

Point it at a repo:

```bash
git a5c status --repo /path/to/repo
git a5c issue list --repo /path/to/repo
git a5c issue show issue-1 --repo /path/to/repo --json
```

### 3) Make a change (example workflow)

Create an issue, comment, and gate it:

```bash
git a5c issue new --repo /path/to/repo --title "Example" --body "Hello" --commit
git a5c issue comment issue-1 --repo /path/to/repo -m "First comment" --commit
git a5c gate needs-human issue-1 --repo /path/to/repo --topic review -m "Need a human review" --commit
```

Attach an agent heartbeat to an entity:

```bash
git a5c agent heartbeat --repo /path/to/repo --agent-id agent-1 --entity issue-1 --ttl-seconds 120 -m "alive" --commit
```

## Glossary (minimal)

- **`.collab/**`**: tracked collaboration event files (portable via Git).
- **treeish**: git ref/oid used for rendering (default `HEAD`).
- **inbox ref**: a git ref whose `.collab/**` content is loaded in addition to the main snapshot.

## Where to read more

- Concepts + theory: `docs/overview.md`
- Protocol RFC (as-built): `docs/protocol/rfc-a5cforge-v1.md`
- CLI reference: `docs/cli/reference.md`