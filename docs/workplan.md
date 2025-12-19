# a5cforge v1 — Specs + Incremental Workplan
SDK → CLI (`git a5c`) → UI (local/remote) → Server webhooks + external orchestration

## Working assumptions
- Repo is the source of truth. `.collab/**` is tracked content.
- All features remain usable **without** policy/signing; verification is additive.
- Deterministic render from a git snapshot is the foundation.

---

# 0) Stack, architecture, and design choices

## 0.1 Language + tooling
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

## 0.2 Architecture
Monorepo (pnpm recommended):
- `packages/sdk` — pure library: parse, render, write events, verify
- `packages/cli` — `git-a5c` shim + commands
- `apps/ui` — Next.js UI
- `packages/server` — minimal HTTP API for remote mode
- `packages/agent` — workflow runner + hook installer
- `fixtures/` — golden repos for test vectors
- `spec/` — RFC + JSON schemas + canonical test vectors

## 0.3 Core design choices
- **Append-only event files**: one event per file by default; bundle NDJSON optional.
- **Deterministic ordering by filename**: `eventKey` encodes HLC + actor + nonce.
- **Render algorithm is pure**: given (repo, treeish, inbox refs, verification mode), output is deterministic.
- **Optional liveness**: agent “active now” requires external `renderTimeMs`. Otherwise show last heartbeat.
- **Extensibility via namespaces**: `agent.*`, `dep.*`, `gate.*`, `ops.*`.
- **Orchestration model**: server emits structured webhooks; external orchestrators run workflows and write back events.

---

# A) Specs (a5cforge/v1)

## A.1 Webhook specification

### A.1.1 Goals
- Enable **external orchestration** (agents/CI/CD/workflows) to react to both:
  - a5cforge events (`.collab/**`)
  - standard Git activity (commits, ref updates)
- No shared database.
- Strong authenticity without shared secrets: **asymmetric cryptography**.

### A.1.2 Configuration
Server reads webhook config from repo (tracked):
- `.collab/webhooks.json`

Example:
```json
{
  "schema": "a5cforge/v1",
  "endpoints": [
    {
      "id": "orchestrator-main",
      "url": "https://orchestrator.example.com/webhook/a5c",
      "events": ["git.*", "issue.*", "pr.*", "agent.*", "dep.*", "gate.*", "ops.*"],
      "enabled": true
    }
  ]
}
```

### A.1.3 Event envelope
All webhooks use HTTP POST with JSON body:

```json
{
  "schema": "a5cforge/v1",
  "type": "<eventType>",
  "id": "<deliveryId>",
  "time": "2025-12-19T14:30:00Z",
  "repo": {"id": "<repoId>", "remote": "<optional>", "path": "<optional>"},
  "source": {"serverId": "<id>", "keyId": "<keyId>"},
  "data": { }
}
```

- `deliveryId` MUST be stable and idempotent per emitted event.
- RECOMMENDED deliveryId for a5cforge events: `{repoId}:{treeish}:{path}:{eventId}`
- RECOMMENDED deliveryId for git events: `{repoId}:{newCommit}:{ref}:{seq}`

### A.1.4 Signing and verification (asymmetric)
Webhook payload authenticity is provided by a **server signature**.

**Public keys in repo (tracked):**
- `.collab/keys/webhooks/<keyId>.pub`

**Headers (recommended):**
- `A5C-Signature: ed25519;<keyId>;<base64(signature)>`
- `A5C-Signed: <canonical-hash>` where `<canonical-hash>` is `sha256:<hex>`

**Canonicalization:**
- Canonical JSON bytes via RFC 8785 (JCS)
- `payloadHash = sha256(jcs(envelope))`
- Signature is over `payloadHash` bytes (or over the JCS bytes; choose one and document—RECOMMENDED: sign the hash).

**Verification algorithm (receiver):**
1) Load the server public key from `.collab/keys/webhooks/<keyId>.pub` (or cached copy).
2) Recompute `payloadHash`.
3) Verify signature.

**Key rotation:**
- New public key is added in a normal commit.
- Server begins signing with new `keyId` after the commit is in the repo.

### A.1.5 Replay and duplication
- Delivery is **at-least-once**; receivers MUST dedupe by `deliveryId`.
- Receivers MAY enforce a max clock skew using `time`.

### A.1.6 Endpoint allowlist and safety
Server MUST support an allowlist mechanism (server config) to prevent SSRF:
- allowed hostnames / CIDRs
- max payload size
- per-endpoint rate limiting

## A.2 Webhook event types
Event types are namespaced. Endpoints subscribe by prefix (e.g., `git.*`).

### A.2.1 Standard Git events (required)
- `git.ref.updated`
  - emitted on any ref movement (push/fast-forward/force)
  - `data`: `{ ref, oldOid, newOid, actor?, transport? }`
- `git.commit.created`
  - emitted for each new commit introduced by a ref update
  - `data`: `{ commitOid, parents[], author, committer, message, filesChanged[] }`
- `git.tree.changed`
  - summarizes changes for a specific ref update range
  - `data`: `{ ref, oldOid, newOid, stats, filesChanged[] }`

**filesChanged[] shape (recommended):**
```json
{ "path": "src/x.ts", "status": "A|M|D|R|C", "oldPath": "...", "additions": 10, "deletions": 2 }
```

### A.2.2 a5cforge entity events
- `issue.event.created`
- `pr.proposal.created`
- `pr.request.created`
- `pr.event.created`
- `comment.created` / `comment.edited` / `comment.redacted`

### A.2.3 Dependency + gate events
- `dep.changed` (blockers)
- `gate.changed` (needsHuman)

### A.2.4 Agent events (required for orchestration triggers)
- `agent.heartbeat.created`
- `agent.claim.changed`
- `agent.dispatch.created`
- `agent.ack.created` / `agent.nack.created`
- `agent.progress.created`

### A.2.5 DevOps events
- `ops.event.created` (generic)
- Recommended specific types if desired by consumers:
  - `ops.build.*`, `ops.test.*`, `ops.deploy.*`, `ops.releaseTag.*`, `ops.rollback.*`

## A.3 Server write API authentication (asymmetric)
External orchestrators will write back a5cforge events via the server. Authentication SHOULD be asymmetric.

**Public keys in repo (tracked):**
- `.collab/keys/clients/<clientId>.pub`

**Request signing (recommended):**
- Header: `A5C-Client: <clientId>`
- Header: `A5C-Client-Signature: ed25519;<clientId>;<base64(signature)>`
- Canonicalize request body JSON via JCS and sign `sha256` hash.

Server verifies signature against the repo-tracked public key.
Authorization policy MAY be expressed in `.collab/policy.json` (optional) and applied when verification mode is enabled.

---


# 1) Phase 1 — Spec + schemas + golden fixtures (TDD foundation)
**Goal:** turn RFC into executable test vectors; everything else builds on this.

## Deliverables
- JSON Schemas:
  - Event base schema
  - Per-kind schemas (issue, pr, comment md front matter map, agent, ops)
- Canonical file path + filename grammar tests
- Golden fixture repos in `fixtures/`
- Render-output golden snapshots (JSON)

## Dev tasks
1. Create `spec/schemas/*.json` for:
   - common fields
   - issue events
   - PR proposal/request
   - comment front matter
   - agent/ops/dep/gate events
2. Create `fixtures/repo-basic`:
   - 2 issues (with comments, edits, redact)
   - 1 PR proposal
   - 1 request-for-work PR (+ claim + bindHead)
3. Create `fixtures/repo-merge-causality`:
   - concurrent comment events merged from two branches
   - verify deterministic ordering
4. Create `fixtures/repo-multi-inbox`:
   - two inbox refs with competing proposals for same `prKey`
5. Create `fixtures/repo-agents-ops`:
   - heartbeats, claims, dispatch+ack
   - ops.build + ops.deploy with artifact refs
6. Write test vector expectations:
   - `spec/vectors/*.json` (expected rendered state)

## Tests (mandatory)
- Schema validation tests for all fixture files
- Deterministic ordering tests on directory listing
- Deterministic render tests: fixture → rendered output matches snapshot

---

# 2) Phase 2 — SDK v0.1 (Read-only: parse + render + discover)
**Goal:** a pure deterministic renderer over a git snapshot.

## SDK surface (initial)
- `openRepo(path)`
- `loadSnapshot({ treeish, inboxRefs?, mirrorUrls? })`
- `listIssues(snapshot)` / `renderIssue(snapshot, issueId, opts)`
- `listPRs(snapshot)` / `renderPR(snapshot, prKey, opts)`
- `verify(snapshot, opts)` (returns per-event verification status; permissive by default)

## Dev tasks
1. Implement Git access layer `IGit`:
   - `revParse(treeish)`
   - `lsTree(commit, path)`
   - `readBlob(commit, path)`
2. Implement filesystem model for `.collab/**` at a treeish.
3. Implement parsers:
   - JSON events
   - Markdown events: front matter + body
   - Bundles (NDJSON)
4. Implement ordering:
   - derive eventKey from filename
   - stable sort
5. Implement discovery:
   - read `.collab/discovery.json`
   - support multiple inbox refs
   - union rule for proposals
6. Implement render algorithms per RFC:
   - Issues: LWW/OR-Set/comment lifecycle
   - PRs: proposal/request + claim/bindHead + mergeRecord/close + deps/gates + agent/ops aggregation

## Tests (mandatory)
- Unit tests for parsers (JSON/MD/bundle) with fuzzed edge cases
- Integration tests: render fixtures and match golden snapshots
- Multi-inbox selection tests
- Regression tests for ordering under merges

---

# 3) Phase 3 — SDK v0.2 (Write: create events + stage + HLC/ULID)
**Goal:** programmatically produce correct event files and stage them, without special commits.

## Design choices
- SDK writers create files under repo working tree.
- CLI/UI decide whether to commit or leave staged.
- HLC state stored in user config (not tracked): `~/.config/a5cforge/hlc.json`.

## Dev tasks
1. Implement ULID generator + test
2. Implement HLC generator (monotonic per actor) + test
3. Implement path builders:
   - issue identity path
   - issue event path (YYYY/MM + eventKey)
   - PR proposal path
   - PR event path
4. Implement writers:
   - issue new
   - comment add/edit/redact
   - dep.blockedBy add/remove
   - gate.needsHuman / gate.cleared
   - PR request/proposal
   - pr.claim / pr.bindHead / pr.mergeRecord / pr.close
   - agent.heartbeat / claim/release / dispatch / ack/nack / progress
   - ops.build / ops.test / ops.deploy / artifact refs
5. Implement optional signing interfaces:
   - `canonicalizeEventPayload(eventFile)`
   - pluggable signer/verifier (no hard dependency)

## Tests (mandatory)
- Golden file emission tests: writer → exact path + filename grammar
- Schema validation on emitted events
- Round-trip tests: emitted events → parser → render produces expected state
- HLC monotonicity tests (including same-ms increments)

---

# 4) Phase 4 — CLI v0.1 (Read-only) — `git-a5c` + `git a5c`
**Goal:** immediate usability: inspect issues/PRs/requests/agents/ops.

## Design choices
- Installable binary named `git-a5c` so `git a5c` works.
- Output modes: human text + `--json`.

## Commands (read)
- `git a5c status` (summary)
- `git a5c issue list|show <id>`
- `git a5c pr list|show <prKey>`
- `git a5c verify` (report)
- `git a5c journal` (recent activity feed: collab events + agent heartbeats + git events)

### `git a5c journal` details
Purpose: quickly answer “who is working on what?” and “what changed recently?” without opening UI.

Suggested flags:
- `--since <duration|timestamp>` (e.g. `2h`, `2025-12-19T12:00Z`)
- `--limit N`
- `--types <comma-separated>` (e.g. `agent.heartbeat,agent.claim,gate.changed,git.ref.updated`)
- `--entity <issueId|prKey>`
- `--active` (derive active heartbeats using `ttlSeconds` and current time)
- `--json`

Output (recommended):
- grouped by entity, then by time
- show actor/agent, kind, summary, and relevant refs


## Dev tasks
1. Command router + help
2. Repo detection (`git rev-parse --show-toplevel`)
3. Render calls into SDK + formatters
4. Add `--treeish`, `--inbox-ref`, `--mirror-url`, `--json`
5. Implement `journal`:
   - read `.collab/**` events across issues + PRs (optionally constrained)
   - read global `.collab/agents/events` and `.collab/ops/events`
   - optionally include git activity (from local git log / recent refs) when `--types` includes `git.*`
   - compute “active” agents using `ttlSeconds` + current time (only for CLI journal; render remains deterministic)


## Tests (mandatory)
- CLI snapshot tests on fixtures (`stdout` golden)
- Exit-code tests for missing repo / invalid inputs
- Journal tests:
  - stable ordering and filtering by `--since`/`--types`/`--entity`
  - active heartbeat derivation correctness (fake time)
  - JSON output schema snapshot

---

# 5) Phase 5 — CLI v0.2 (Write + hooks install)
**Goal:** create/edit collaboration artifacts from terminal, staged or committed.

## Commands (write)
- Issues:
  - `git a5c issue new --title ... [--body ...]`
  - `git a5c issue comment <id> -m ...`
  - `git a5c issue edit-comment <commentId> -m ...`
  - `git a5c issue redact-comment <commentId>`
  - `git a5c issue close|reopen <id>`
  - `git a5c block <entity> --by <issue/pr>` / `git a5c unblock ...`
  - `git a5c gate needs-human <entity> --topic ... -m ...`
  - `git a5c gate clear <entity>`
- PRs:
  - `git a5c pr propose --base main --head feature-x --title ...`
  - `git a5c pr request --base main --title ... --body ...`
  - `git a5c pr claim <prKey> --head-ref ...`
  - `git a5c pr bind-head <prKey> --head-ref ...`
  - `git a5c pr merge-record <prKey> --method squash --commit <oid>`
- Agents/ops:
  - `git a5c agent heartbeat ...`
  - `git a5c agent dispatch ...`
  - `git a5c ops deploy ... --env staging --rev HEAD --artifact ...`
- Hooks:
  - `git a5c hooks install|uninstall`

## Dev tasks
1. Implement write commands using SDK writers
2. Add `--stage-only` and `--commit` modes
3. Implement `hooks install`:
   - add git hook scripts that call CLI (post-commit, post-merge)
4. Implement policy-aware warnings (optional)

## Tests (mandatory)
- Integration tests: run CLI commands in temp fixture clones
- Verify files staged/committed correctly
- Hook installer tests (idempotent)

---

# 6) Phase 6 — UI v0.1 (Local read-only)
**Goal:** a local forge-like UI for browsing.

## Architecture
- Next.js UI
- Local API routes read from repo path (no DB)

## UI features (read)
- Issues list + detail thread (threading, edits, redactions)
- PR list + request-for-work list
- PR detail: proposal/request + events + anchors
- Status badges: blockers, needsHuman, last agent heartbeat
- Ops timeline (build/deploy) + artifact links

## Dev tasks
1. UI skeleton + routing
2. API endpoints wrapping SDK read calls
3. Components: IssueView, PRView, Timeline, AgentPanel, OpsPanel
4. Add treeish selector and inbox selector

## Tests (mandatory)
- Component tests (Vitest)
- API route tests against fixtures
- Playwright smoke tests: open pages, render key states

---

# 7) Phase 7 — UI v0.2 (Write + remote mode)
**Goal:** create events from UI; run UI locally or on a remote machine.

## Remote mode
- **Remote repo server** (`packages/server`) (chosen)
  - Minimal stateless service: expose git snapshot reads + write endpoints
  - No database; only manipulates working tree and runs git
  - Supports structured webhooks (Phase 8)


## Dev tasks
1. Add UI write actions: comment, request-for-work PR, claim/bind, gate/blockers
2. Implement remote server:
   - auth via SSH keys or simple token (optional)
   - endpoints: list/render, write event, stage, commit
3. Add repo adapters: local vs remote

## Tests (mandatory)
- E2E Playwright: create comment → event file → render updates
- Remote server integration tests in container

---

# 8) Phase 8 — Server webhooks + external orchestration integration (v0.1)
**Goal:** implement the webhook subsystem and git-event emission described in Specs (Section A).

## Dev tasks
1. Implement `.collab/webhooks.json` loader + validation (schema tests)
2. Implement webhook emitter pipeline:
   - create envelope
   - compute canonical JCS bytes
   - compute `payloadHash`
   - sign with server private key (stored outside repo)
   - send POST
3. Implement delivery system:
   - retries with backoff
   - dead-letter log
   - per-endpoint rate limiting
4. Implement git event emission:
   - on ref update, compute introduced commits
   - for each commit: emit `git.commit.created`
   - emit `git.ref.updated` and `git.tree.changed` with `filesChanged[]`
5. Implement a5cforge event emission:
   - on server write endpoints (creating `.collab/**` files), emit relevant `*.created` webhooks
   - map kinds → webhook types (table-driven)
6. Implement SSRF safety:
   - endpoint allowlist (server config)
   - payload size limits
7. Implement CLI helpers:
   - `git a5c webhook test`
   - `git a5c webhook status`

## Tests (mandatory)
- Unit tests:
  - JCS canonicalization correctness
  - signature generation and verification using repo-tracked public keys
  - deliveryId/idempotency key formation
- Integration tests:
  - local webhook receiver validates signatures
  - retry/backoff behavior (fake timers)
  - git ref update → correct git webhook sequence + payload snapshots
- Snapshot tests:
  - webhook JSON bodies for each event type

---

# 9) Phase 9 — Hardening to v1.0 — Hardening to v1.0 — Hardening to v1.0
**Goal:** stability, performance, interop.

## Dev tasks
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

## Tests (mandatory)
- Load tests with synthetic event volume
- Compatibility tests across versions
- Verify determinism across platforms (Windows/macOS/Linux)

