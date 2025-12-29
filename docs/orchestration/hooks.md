# Hooks

Hooks are repo-owned executables under `.a5c/hooks/**`.

## Hook mapping

Playbooks do not embed hook paths. The runner resolves hook locations via:

`/.a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml`

Schema: `spec/schemas/hook.mapping.schema.json`

Hook mapping values are hook *names* (not file paths). The runner resolves them like:

- Step hooks: `.a5c/hooks/steps/<name>.js`
- Evidence hooks: `.a5c/hooks/evidence/<name>.js`

The agent hook name supports `[profile]` substitution. Example mapping:

```yaml
step_hooks:
  agent: agent/[profile]
  reward: reward
evidence_hooks:
  command: command
```

## Step hooks

`hooks.run` is executed by `git a5c hook exec`. Input is JSON via stdin.

Input schema:
- `spec/schemas/run.hook.step.input.schema.json`

### Running predefined agent CLIs

Repo agent hooks can delegate to `git a5c agent run` to execute a predefined agent CLI based on `/.a5c/predefined.yaml`.

This is intended for repos that want a stable, repeatable way to invoke a locally-installed agent (Claude Code, Aider, etc.) without hardcoding the command line into every playbook.

Agent output (example):

```json
{ "ok": true }
```

Reward output options:

1) Provide a `reward_report` directly:

```json
{ "ok": true, "reward_report": { "reward_total": 0.92 } }
```

2) Omit `reward_report` and let the runner compute it from evidence producers.

## Evidence producer hooks

When a reward step is executed and the reward hook does not emit a `reward_report`, the runner will:

1) Look up signals in the resolved template.
2) Run each signal’s configured evidence producer hook.
3) Compute a reward report from evidence (pure scoring).

Evidence producer hook paths are resolved from the repo-level hook mapping by `producer.kind` (MVP: `command`).

Input schema:
- `spec/schemas/run.hook.evidence.input.schema.json`

Output schema:
- `spec/schemas/run.hook.evidence.output.schema.json`

## Environment knobs

- `A5C_HEARTBEAT_MS`: heartbeat interval for running hooks.
- `A5C_STEP_IDLE_SECONDS`: sweep timeout threshold.
- `A5C_NOW_ISO`: deterministic clock for tests/sweep.
- `A5C_VALIDATE_HOOK_IO=1`: validate hook outputs against `spec/schemas/run.hook.*.schema.json` (fails the command on mismatch).
