# Remote mode
- **Remote repo server** (`packages/server`) (chosen)
  - Minimal stateless service: expose git snapshot reads + write endpoints
  - No database; only manipulates working tree and runs git
  - Supports structured webhooks (Phase 8)


