# Dev tasks
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


