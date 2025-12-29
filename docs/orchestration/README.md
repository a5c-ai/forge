# Orchestration (A5C)

This repo includes an event-sourced orchestration layer (A5C orchestration) for running step-based playbooks.

**Core idea:** durable orchestration state is append-only events under:

`/.collab/runs/<run_id>/events/*.json`

The runner derives state from events and plans the next transition.

## Quickstart

Use a copy/paste repo template or a fixture repo as a reference:

- Copy/paste template: `docs/orchestration/examples/repo-min/`
- Fixtures:
  - `fixtures/repo-orchestration-min/`
  - `fixtures/repo-orchestration-evidence-scoring/`
  - `fixtures/repo-orchestration-deps-wait/`

From inside a repo:

```bash
# create a run
git a5c run dispatch --playbook playbooks/min.yaml@v1 --run-id run_001

# one command: dispatch + tick loop
git a5c run playbook --playbook playbooks/min.yaml@v1 --run-id run_001 --max-iterations 50

# plan + execute transitions until blocked or done
git a5c run tick --max-transitions 10 --run-id run_001

# plan only
git a5c run reconcile --json --run-id run_001

# execute a plan file
git a5c hook exec --plan /tmp/plan.json
```

Notes:

- Git runs the CLI as `git a5c ...` when `git-a5c` is on your PATH.
- If hooks shell out to the CLI, prefer calling `git-a5c` directly or set `A5C_CLI` to a JS entrypoint.

## Commands

- `git a5c run dispatch`: create a run and initial events.
- `git a5c run playbook`: dispatch + tick loop convenience.
- `git a5c run reconcile`: derive + plan transitions; may emit non-exec events.
- `git a5c run tick`: reconcile + execute one transition at a time (looped).
- `git a5c hook exec`: execute `EXECUTE_STEP` plan entries.
- `git a5c run sweep`: detect stale executions and emit timeout events.
- `git a5c run resume` / `git a5c run complete-step`: continue past pauses.

## Exit codes

- `0`: success / no work
- `30`: blocked on dependencies (`WAIT_DEPS`)
- `2`: usage error

## Validated By Tests

The repo includes end-to-end integration tests that run multi-command workflows.

- Orchestration-only flows live under `packages/cli/test/cli.orchestration.*.test.ts`.
- Cross-feature flows (issue/pr/gate/ops/etc. + orchestration) live under `packages/cli/test/cli.e2e.*.test.ts`.

## Related docs

- End-to-end workflow: `docs/orchestration/end-to-end.md`
- One-command local runner: `docs/orchestration/run-playbook.md`
- Recipes (common multi-command flows): `docs/orchestration/recipes.md`
- Playbooks/templates: `docs/orchestration/playbooks.md`
- Hooks: `docs/orchestration/hooks.md`
- Protocol: `docs/orchestration/protocol.md`
- Templating (`agent generate-context`): `docs/cli/agent-generate-context.md`
- Reference guide (design doc): `docs/a_5_c_orchestration_implementation_guide.md`

## Workplan

- Next steps checklist: `docs/workplan/a5cforge-next-steps.md`
