# 2) Phase 2 — SDK v0.1 (Read-only: parse + render + discover)
**Goal:** a pure deterministic renderer over a git snapshot.

## SDK surface (initial)
- `openRepo(path)`
- `loadSnapshot({ treeish, inboxRefs?, mirrorUrls? })`
- `listIssues(snapshot)` / `renderIssue(snapshot, issueId, opts)`
- `listPRs(snapshot)` / `renderPR(snapshot, prKey, opts)`
- `verify(snapshot, opts)` (returns per-event verification status; permissive by default)


