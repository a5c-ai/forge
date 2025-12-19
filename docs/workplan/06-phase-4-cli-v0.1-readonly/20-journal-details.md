# `git a5c journal` details
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


