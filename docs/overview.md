# a5cforge overview (start here)

**Audience:** newcomers (users, contributors)  
**Status:** draft

## What problem is this solving?

a5cforge is a Git-first collaboration layer for tracking “work” (issues, PR intent, agent activity, gates, blockers, ops status) **inside the repository**.

Instead of a database, the collaboration state is stored as **tracked event files** under `.collab/**` and rendered deterministically from a Git snapshot.

## The mental model

- **Git is the database**: cloning the repo clones the collaboration state.
- **Events are files**: collaboration actions append new files under `.collab/**`.
- **Rendering is pure**: given `(treeish, inbox refs)`, the SDK produces a deterministic view.
- **External systems integrate via webhooks**: server emits signed envelopes; external orchestrators react and may write events back (optional).

## What a5cforge adds on top of “plain Git”

### Tracked collaboration state: `.collab/**`

`.collab/**` is committed content. It is the portable collaboration history.

See:

- Protocol RFC: `docs/protocol/rfc-a5cforge-v1.md`
- Schemas: `spec/schemas/README.md`

### Deterministic ordering by filename

Events are ordered by filename-derived parts, not commit timestamps.

See: `docs/protocol/event-files.md`.

### Inbox refs (optional)

An “inbox” is a Git ref whose tree contains `.collab/**` events that are loaded in addition to the main snapshot. This enables intake flows (e.g., GitHub PR opened → proposal in inbox) without touching main history immediately.

See: `docs/protocol/github-ingestion.md`.

### Hooks write convenience artifacts under `.git/`

Hooks can maintain a “recent journal” file under `.git/` (not tracked) for UI/automation convenience.

See: `docs/protocol/rfc-a5cforge-v1.md` (Hooks section).

## How it works end-to-end (example)

1) A user creates an issue (writes `issue.event.created`).
2) A user comments (writes `comment.created`).
3) A user sets a gate or blockers (writes `gate.changed` / `dep.changed`).
4) An agent claims and posts heartbeats (writes `agent.claim.changed` / `agent.heartbeat.created`).
5) CI/devops systems post status (writes `ops.event.created`).
6) Renderers derive a single view for UI/CLI from the event stream.

See: `docs/protocol/rfc-a5cforge-v1.md` → “How it works together (workflows)”.

## Getting started quickly

- If you want to run everything locally (temp repo + server + UI):
  - `node scripts/local-bringup.mjs --help`
- If you want the CLI reference:
  - `docs/cli/reference.md`
- If you want protocol details:
  - `docs/protocol/rfc-a5cforge-v1.md`
