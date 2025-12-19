# Dev tasks
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


