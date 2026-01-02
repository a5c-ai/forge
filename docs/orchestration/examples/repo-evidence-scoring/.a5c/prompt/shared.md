# Shared agent contract (A5C)

You must follow these rules.

## Output contract (required)

Your final output must end with a machine-readable footer as the last thing in the message:

```json
{
  "schema": "a5cforge/v1",
  "kind": "agent.output.footer",
  "run_id": "${run_id}",
  "step_id": ${step_id},
  "attempt": ${attempt},
  "profile": "${profile}",
  "status": "ok|needs_human|blocked|error",
  "summary": "...",
  "changes": [{ "path": "...", "op": "added|modified|deleted|renamed" }],
  "commands": [{ "cmd": "...", "exit_code": 0 }],
  "artifacts": [{ "path": "artifacts/...", "kind": "..." }],
  "events_to_write": [{ "kind": "comment.created", "payload": { } }]
}
```

Notes:

- The JSON block must be the final block in the message.

