# 0.3 Core design choices
- **Append-only event files**: one event per file by default; bundle NDJSON optional.
- **Deterministic ordering by filename**: `eventKey` encodes HLC + actor + nonce.
- **Render algorithm is pure**: given (repo, treeish, inbox refs, verification mode), output is deterministic.
- **Optional liveness**: agent “active now” requires external `renderTimeMs`. Otherwise show last heartbeat.
- **Extensibility via namespaces**: `agent.*`, `dep.*`, `gate.*`, `ops.*`.
- **Orchestration model**: server emits structured webhooks; external orchestrators run workflows and write back events.


