# RFC: a5cforge/v1 — Git-layer protocol (as-built)

**Audience:** users, contributors, operators  
**Status:** draft (matches current implementation)

This document describes the **protocol layer that a5cforge adds on top of standard Git**: what is tracked in the repository, how it is interpreted, and what invariants make rendering deterministic.

Related (more detailed, split docs):

- `docs/protocol/git-layer.md`
- `docs/protocol/event-files.md`
- `docs/cli/reference.md`
- `spec/schemas/README.md`

## 1. Scope and non-goals

### In scope

- The tracked and portable “collaboration state” stored under `.collab/**`
- Event file formats and deterministic ordering
- Inbox refs and discovery configuration
- Hook-produced, non-tracked artifacts under `.git/`
- Tracked webhook configuration shape (`.collab/webhooks.json`) and key locations

### Out of scope

- Transport-specific APIs (server HTTP routes). See `docs/protocol/server-http-api.md`.
- UI implementation details.

## 2. Git is the database

a5cforge does not use a database. The Git repository is the source of truth, and the protocol surface is:

- **Tracked**: `.collab/**` (committed files)
- **Derived**: rendered state from a Git snapshot
- **Optional, non-tracked conveniences**: files written under `.git/`

## 3. Tracked collaboration data: `.collab/**`

All collaboration events are stored as files under `.collab/**`. These files are committed and replicated through normal Git operations (clone/fetch/merge).

Event shapes are defined by JSON Schemas under `spec/schemas/` (see `spec/schemas/README.md`).

### 3.1 Event kinds

Each event has a `kind` (namespaced string like `comment.created`). The v1 baseline includes (see `spec/schemas/kind-map.v1.json`):

- `issue.event.created`
- `comment.created`, `comment.edited`, `comment.redacted`
- `pr.proposal.created`, `pr.request.created`, `pr.event.created`
- `dep.changed`, `gate.changed`
- `agent.*` (heartbeat/claim/dispatch/ack/nack/progress)
- `ops.event.created`

### 3.2 Config files under `.collab/**`

Some `.collab/**` files are **configuration**, not events. Implementations explicitly exclude these from the event stream:

- `.collab/discovery.json` (discovery config; see below)
- `.collab/webhooks.json` (webhook config; see `docs/protocol/outgoing-webhooks.md`)

## 4. Event file formats

The implementation supports three file formats:

- **JSON**: `*.json` containing a single JSON event object
- **Markdown**: `*.md` where the YAML frontmatter is the event object
  - If `payload.body` is missing, the markdown body is injected into `payload.body`
- **NDJSON bundle**: `*.ndjson` with one JSON object per non-empty line

Implementation reference: `packages/sdk/src/collab/parseEventFile.ts`.

## 5. Deterministic ordering by filename

Event ordering is derived from filenames, not from commit time.

### 5.1 Filename grammar

Filenames encode an “event key”:

`<tsMs>_<actor>_<nonce>.<kind>.<ext>`

Example:

`1734628200000_alice_0001.comment.created.json`

### 5.2 Sorting rules

Comparator: `packages/sdk/src/collab/eventKey.ts`. Sort order:

- `tsMs` ascending
- `actor` ascending
- `nonce` ascending
- `kind` ascending
- then full path lexicographically

For `.ndjson` bundles, entries are addressed as `<path>::<lineIndex>` and preserve line order within the same file.

## 6. Rendering model (determinism contract)

Rendering is deterministic given:

- a **Git snapshot** (treeish resolved to a commit)
- optional **inbox refs**

The SDK loads a snapshot by scanning `.collab/**` from the commit tree and then reduces those events to rendered state.

Implementation reference: `packages/sdk/src/collab/loadSnapshot.ts`, renderers: `packages/sdk/src/render/*`.

## 7. Inbox refs + discovery

Inbox refs are optional Git refs that contain `.collab/**` events and can be loaded alongside the main snapshot.

This supports “intake” flows (e.g. GitHub webhook ingestion writing PR proposals to an inbox ref) without forcing them onto `main` immediately.

### 7.1 Discovery config

Discovery is configured by an optional tracked file:

- `.collab/discovery.json`

As built, the SDK reads it to get default `inboxRefs` when the caller does not supply any.

Implementation reference: `packages/sdk/src/collab/discovery.ts`.

## 8. Hook-derived artifacts (non-tracked)

The CLI can install Git hooks (`post-commit`, `post-merge`) that write a “recent journal” JSON file under `.git/`:

- `$(git rev-parse --git-path a5c-last-journal.json)`

This is a convenience artifact (not tracked) intended for tooling/UIs.

Implementation reference: `packages/cli/src/commands/hooks.ts`.

## 9. Webhook config and key locations (tracked vs not)

Webhook delivery is configured with tracked repo content:

- `.collab/webhooks.json` (schema: `spec/schemas/webhooks.config.schema.json`)

Public keys for signature verification are tracked under `.collab/keys/**`:

- webhook receiver public keys: `.collab/keys/webhooks/<keyId>.pub`
- client signing public keys: `.collab/keys/clients/<clientId>.pub`

Private keys (server signing, client signing) are **not** tracked and are managed by operators/clients.

See:

- `docs/protocol/outgoing-webhooks.md`
- `docs/protocol/auth.md`

## 10. Compatibility and forward-compat assumptions

- Schemas generally allow additional fields (forward-compatible).
- Snapshot loading is tolerant of malformed event files (parse errors are collected rather than crashing).

## 11. Entity model: issues, PRs, agents, ops

This section documents the **as-built** semantics for the core entity types and how they are derived from events.

### 11.1 File layout (paths)

The SDK writers place events under these directories (see `packages/sdk/src/write/paths.ts`):

- Issues:
  - `.collab/issues/<issueId>/events/<YYYY>/<MM>/...`
- PRs:
  - `.collab/prs/<prKey>/events/<YYYY>/<MM>/...`
- Agents:
  - `.collab/agents/events/<YYYY>/<MM>/...`
- Ops:
  - `.collab/ops/events/<YYYY>/<MM>/...`

### 11.2 Issues

#### Root event

- `issue.event.created`
  - payload: `{ issueId, title, body?, state: "open" }`
  - writer: `packages/sdk/src/write/writerIssues.ts`
  - rendering: first `issue.event.created` encountered for an `issueId` is treated as the “root” (see `packages/sdk/src/render/issues.ts`).

#### Comments

- `comment.created`, `comment.edited`, `comment.redacted`
  - payload includes `entity: { type:"issue", id:<issueId> }` and `commentId`
  - writers: `packages/sdk/src/write/writerComments.ts`
  - nuance (rendering): edits/redactions create/update a per-`commentId` record; redaction clears body and sets `redacted` metadata.

#### Blockers / dependencies

- `dep.changed`
  - payload: `{ entity, op:"add"|"remove", by:{type:"issue"|"pr", id}, note? }`
  - writer: `packages/sdk/src/write/writerIssues.ts`
  - nuance (rendering): blockers are keyed by `by.type:by.id` (add overwrites, remove deletes).

#### Needs-human gate

- `gate.changed`
  - payload: `{ entity, needsHuman:boolean, topic?, message? }`
  - writer: `packages/sdk/src/write/writerIssues.ts`
  - nuance (rendering): latest event sets/clears `needsHuman` for that entity.

#### Agent claim

- `agent.claim.changed`
  - payload: `{ agentId, entity, op:"claim"|"release", note? }`
  - writer: `packages/sdk/src/write/writerAgents.ts`
  - nuance (rendering): claims are keyed by `agentId`; claim stores `(by,time,note)`; release removes.

### 11.3 PRs

#### Root events

- `pr.proposal.created`
  - payload: `{ prKey, baseRef, headRef, title, body? }`
  - writer: `packages/sdk/src/write/writerPrs.ts`
- `pr.request.created`
  - payload: `{ prKey, baseRef, title, body? }`
  - writer: `packages/sdk/src/write/writerPrs.ts`

#### Nuance: root selection + inbox proposals

Rendering includes inbox events (see `packages/sdk/src/render/prs.ts`):

- The PR root is chosen deterministically among proposal/request events for the `prKey` using the tuple `(time, actor, id)` (lexicographic compare on strings).
- If an event is a `pr.proposal.created` that came from an inbox ref, it is also appended to `inboxProposals[]` for display; the root may still be from main or inbox depending on ordering.

#### PR events

- `pr.event.created`
  - payload: `{ prKey, action, headRef?, message? }`
  - writer: `packages/sdk/src/write/writerPrs.ts`
  - current CLI uses `action: "claim"` and `action: "bindHead"` (see `packages/cli/src/commands/pr.ts`).

#### Blockers / gate / agent claims / ops

PR rendering aggregates:

- blockers from `dep.changed` where `payload.entity = {type:"pr", id:<prKey>}`
- needsHuman from `gate.changed`
- claims from `agent.claim.changed`
- ops from `ops.event.created`

### 11.4 Agents

#### Heartbeat

- `agent.heartbeat.created`
  - payload: `{ agentId, ttlSeconds?, status?, entity? }`
  - writer: `packages/sdk/src/write/writerAgents.ts`
  - CLI: `git a5c agent heartbeat [--entity <issueId|prKey>]` (see `packages/cli/src/commands/agent.ts`)
  - nuance: `journal --active` determines liveness using `(event.time + ttlSeconds) >= now`.

#### Dispatch + ack/nack/progress

- `agent.dispatch.created`: `{ dispatchId, agentId, entity, task?, params? }`
- `agent.ack.created`: `{ dispatchId, agentId, message? }`
- `agent.nack.created`: `{ dispatchId, agentId, error }`
- `agent.progress.created`: `{ dispatchId, agentId, percent?, message? }`

### 11.5 Ops

- `ops.event.created`
  - payload: `{ op, entity, status?, artifact? }`
  - writers: `packages/sdk/src/write/writerOps.ts`
  - CLI: `git a5c ops build|test|deploy --entity <issueId|prKey>` (see `packages/cli/src/commands/ops.ts`)

## 12. “How it works together” (workflows)

This section is a runnable mental model of typical flows.

### 12.1 Local-only workflow (CLI + tracked events)

Create an issue:

```bash
git a5c issue new --title "Example" --body "hello" --commit
```

Add a comment:

```bash
git a5c issue comment <issueId> -m "first comment" --commit
```

Gate it for humans:

```bash
git a5c gate needs-human <issueId> --topic review -m "please review" --commit
```

Block it on a PR:

```bash
git a5c block <issueId> --by pr --op add -m "blocked by pr-1" --commit
```

Request PR work:

```bash
git a5c pr request --base main --title "please pick this up" --id pr-1 --commit
```

Attach an agent heartbeat and claim:

```bash
git a5c agent heartbeat --agent-id agent-1 --entity <issueId> --ttl-seconds 120 -m "alive" --commit
git a5c issue show <issueId> --json
```

### 12.2 Remote mode (UI + server)

Remote mode uses:

- UI configured with `A5C_REPO` for reads
- UI configured with `A5C_REMOTE_URL` for write actions (proxy to server)
- server configured with `A5C_SERVER_REPO` and optional `A5C_SERVER_TOKEN`

See `docs/guides/admin-guide.md` and `docs/protocol/server-http-api.md`.

### 12.3 Inbox intake (GitHub PR opened → proposal)

GitHub ingestion writes a `pr.proposal.created` event into an inbox ref (default `refs/a5c/inbox/github`).

See `docs/protocol/github-ingestion.md`.
