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
  "commands": [{ "cmd": "npm run test:ci", "exit_code": 0 }],
  "artifacts": [{ "path": "artifacts/...", "kind": "..." }],
  "events_to_write": [{ "kind": "comment.created", "payload": { } }],
  "notes": ["optional"],
  "next_steps": ["optional"]
}
```

Notes:

- The JSON block must be the final block in the message.
- If you are blocked, set `status` to `blocked` and explain in `summary`.

## Repo protocol

- Durable state is tracked under `.collab/**`.
- Orchestration state is under `.collab/runs/**`.
- Non-tracked artifacts should go under `artifacts/`.

