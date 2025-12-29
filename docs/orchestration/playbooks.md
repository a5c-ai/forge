# Playbooks

Playbooks are YAML (or JSON) templates stored in the repo (typically under `playbooks/`).

Minimal example:

```yaml
template_id: example
version: v1
steps:
  - step_id: 1
    type: agent
    agent:
      profile: default
  - step_id: 2
    type: reward
    reward:
      signals: [unit]
      policy: { on_fail: pause }
      thresholds: { pass: 0.8 }
signals:
  unit:
    severity: HARD
    weight: 1
    producer: jest
    producer_args: { cmd: pnpm test }
    scoring: { mode: pass_fail }
evidence_producers:
  jest:
    kind: command
    default_outputs: [unit_report]
```

## Hook resolution (repo-level)

Playbooks do **not** embed hook paths. Hooks are resolved via a repo-level mapping file:

`/.a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml`

This mapping defines:

- the single `agent` step hook
- the single `reward` step hook
- evidence producer hooks by `kind` (MVP: `command`)

## Overrides

`git a5c run dispatch --overrides-file <path>` accepts a JSON object with `template_patch`, applied via RFC 7396 JSON Merge Patch.

## Dependencies

An agent step may spawn dependent runs by returning `spawn[]` from its hook output.
The parent run blocks (`WAIT_DEPS`) until dependents are `DONE`.
