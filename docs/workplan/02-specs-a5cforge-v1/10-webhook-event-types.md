# A.2 Webhook event types
Event types are namespaced. Endpoints subscribe by prefix (e.g., `git.*`).

**Audience:** contributors, operators  
**Status:** draft

Related:
- Schemas index: `spec/schemas/README.md`
- Event schemas live under: `spec/schemas/*.schema.json`

## A.2.1 Standard Git events (required)
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

## A.2.2 a5cforge entity events
- `issue.event.created`
- `pr.proposal.created`
- `pr.request.created`
- `pr.event.created`
- `comment.created` / `comment.edited` / `comment.redacted`

## A.2.3 Dependency + gate events
- `dep.changed` (blockers)
- `gate.changed` (needsHuman)

## A.2.4 Agent events (required for orchestration triggers)
- `agent.heartbeat.created`
- `agent.claim.changed`
- `agent.dispatch.created`
- `agent.ack.created` / `agent.nack.created`
- `agent.progress.created`

## A.2.5 DevOps events
- `ops.event.created` (generic)
- Recommended specific types if desired by consumers:
  - `ops.build.*`, `ops.test.*`, `ops.deploy.*`, `ops.releaseTag.*`, `ops.rollback.*`


