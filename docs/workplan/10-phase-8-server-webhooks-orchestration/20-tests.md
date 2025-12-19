# Tests (mandatory)
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


