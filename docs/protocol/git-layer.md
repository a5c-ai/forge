# The a5cforge layer on top of Git

**Audience:** users, contributors  
**Status:** draft

This describes what a5cforge adds **beyond standard Git**, and what is tracked/portable between clones.

## 1) Tracked collaboration data: `.collab/**`

a5cforge stores collaboration events as files under `.collab/**` in your repo. These files are committed and travel with Git history like any other content.

Event shapes are validated by schemas under `spec/schemas/` and are rendered by the SDK from a Git snapshot.

## 2) Event-sourcing and deterministic rendering

- The system is **event-sourced**: state is computed by reducing events.
- Rendering is deterministic for a given `(treeish, inboxRefs[])`.

Implementation:

- Snapshot loader: `packages/sdk/src/collab/loadSnapshot.ts`
- Renderer: `packages/sdk/src/render/issues.ts`, `packages/sdk/src/render/prs.ts`

## 3) Deterministic ordering by filename (not commit time)

Events are ordered using filename-derived parts:

`<tsMs>_<actor>_<nonce>.<kind>.<ext>`

Comparator: `packages/sdk/src/collab/eventKey.ts`.

## 4) Inbox refs: “external/event intake” without touching main history

In addition to the main snapshot, the SDK can load events from one or more Git refs (“inboxes”):

- configured by `.collab/discovery.json` (optional)
- or provided explicitly to `loadSnapshot({ inboxRefs })`

This supports external integrations (e.g. GitHub webhook PR proposals) without requiring those events to be in `main` immediately.

## 5) Hooks: derive a “recent journal” snapshot under `.git/`

The CLI can install `post-commit` and `post-merge` hooks:

- `git a5c hooks install`
- `git a5c hooks uninstall`

The installed hook runs:

- `git a5c journal --since 2h --limit 20 --json > "$(git rev-parse --git-path a5c-last-journal.json)"`

So the hook’s output is stored under `.git/` (not tracked), as a convenience for UIs/agents.

Implementation: `packages/cli/src/commands/hooks.ts`.

## 6) Webhooks: emitting state changes to external orchestrators

The server can deliver outgoing webhooks configured in tracked repo content:

- `.collab/webhooks.json`

See:

- `docs/protocol/outgoing-webhooks.md`
- `packages/server/src/webhooks/outgoing.ts`
