# Dev tasks
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


