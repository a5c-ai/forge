# End-to-end: Running A5C Orchestration

This guide shows how the pieces fit together in a coherent workflow:

- a repo defines a **playbook** (`playbooks/*.yaml`)
- the runner creates a **run** (`run dispatch`)
- the runner **plans** transitions (`run reconcile`)
- the hook executor **executes** step hooks (`hook exec` / `run tick`)
- agent hooks optionally delegate to **predefined agent CLIs** (`agent run`)
- agent hooks optionally render prompts via **templating** (`agent generate-context`)
- operational tooling can parse Codex logs (`parse --type codex`) for dashboards/ETL

The durable state is always append-only events:

`/.collab/runs/<run_id>/events/*.json`

## Minimal repo layout

```text
playbooks/
  web_feature.yaml
.a5c/
  hooks/
    by-file-name-mapping/
      01-ordered-hook.yaml
    steps/
      agent/
        default.js
      reward.js
    evidence/
      command.js
  predefined.yaml          # optional (only if agent hooks call `git a5c agent run`)
```

Hook mapping values are hook *names* (not file paths). Example:

```yaml
step_hooks:
  agent: agent/[profile]
  reward: reward
evidence_hooks:
  command: command
```

## Copy/paste repo template

A minimal (but complete) setup is provided under:

`docs/orchestration/examples/repo-min/`

It includes:

- a playbook with one `agent` step and one `reward` step
- an agent hook that renders a prompt via `agent generate-context` then calls `agent run`
- a predefined agent config that uses a tiny echo agent (for local testing)

To try it quickly:

```bash
cp -R docs/orchestration/examples/repo-min/* /path/to/your/repo/
git add -A
git commit -m "Add a5c orchestration repo template"

# One command: dispatch + tick loop (agent + reward)
git a5c run playbook --playbook playbooks/web_feature.yaml@v1 --run-id run_001 --max-iterations 50

# Equivalent low-level commands
git a5c run dispatch --playbook playbooks/web_feature.yaml@v1 --run-id run_001
git a5c run tick --run-id run_001 --max-transitions 10
```

The example uses `node` hooks for portability.

If your hooks shell out to the CLI (like the example agent hook does), ensure `git-a5c` is on your `PATH`, or set `A5C_CLI` to a `git-a5c` JS entrypoint.

For more multi-command workflows (issue -> orchestration -> scoring, redo, deps, sweep), see `docs/orchestration/recipes.md`.

## 1) Dispatch a run

Create a run and initial events:

```bash
git a5c run dispatch --playbook playbooks/web_feature.yaml@v1 --run-id run_001
```

This writes events under:

`/.collab/runs/run_001/events/`

## 2) Plan transitions (reconcile)

Reconcile is a pure planner: it derives run state from events + the playbook, then proposes the next transition(s).

```bash
git a5c run reconcile --run-id run_001 --json
```

The JSON output is a plan envelope containing one or more plan entries.

## 3) Execute transitions (tick or hook exec)

### Option A: `run tick` (recommended)

`tick` is a convenience command that runs `reconcile` then executes the plan.

```bash
git a5c run tick --run-id run_001 --max-transitions 10
```

### Option B: `hook exec` (manual)

```bash
git a5c run reconcile --run-id run_001 --json > plan.json
git a5c hook exec --plan plan.json
```

## 4) How an agent step typically runs

When the planner proposes an `EXECUTE_STEP` transition for an agent step:

1) `hook exec` writes `run.step.exec.started`.
2) It runs the resolved step hook (from `.a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml`).
3) The hook returns JSON like `{ "ok": true }`.
4) The executor emits `run.step.completed` or `run.step.failed`.

### Optional: render a prompt

Agent hooks often want a large Markdown “context” (issue body, recent commits, etc.).
The repo can do this with `agent generate-context`.

Example (from inside a hook):

```bash
git a5c agent generate-context \
  --in .a5c/tmp/event.json \
  --template .a5c/main.md \
  --var profile=default \
  --out .a5c/tmp/prompt.md
```

Supported template URIs include `file://...`, `github://...`, and repo-local `git://<ref>/<path>`.

See `docs/cli/agent-generate-context.md` for the full templating reference.

### Optional: call a predefined agent CLI

Instead of hardcoding a CLI invocation in the playbook, repos can define `/.a5c/predefined.yaml` and let their agent hook delegate to:

```bash
git a5c agent run --profile default --in .a5c/tmp/prompt.md --out .a5c/tmp/agent-output.md
```

This pattern is intended for “bring your own agent” workflows (Claude Code, Aider, etc.) while keeping playbooks stable.

## 5) Reward + evidence scoring

Reward is a step type (`step_type: reward`).

- If the reward hook returns `reward_report`, the executor emits `run.reward.reported`.
- If the reward hook does not return a report and the template defines signals + evidence producers, the executor:
  1) runs evidence producer hooks
  2) computes `reward_total`
  3) emits `run.reward.reported`

## 6) Operational commands

### Sweep stale executions

```bash
git a5c run sweep --max 100
```

### Resume after a pause / complete a human step

```bash
git a5c run resume --run-id run_001 -m "override breakpoint"
git a5c run complete-step --run-id run_001 -m "human complete"
```

### Parse Codex logs

If you run agents via Codex and want structured JSONL for downstream processing:

```bash
cat codex.log | git a5c parse --type codex --out codex.jsonl
```

More examples: `docs/cli/parse.md`.

## 7) Hardening knobs

- `A5C_VALIDATE_HOOK_IO=1`: validate hook JSON outputs against `spec/schemas/run.hook.*.schema.json`.
- `A5C_HEARTBEAT_MS`: hook heartbeat interval.
- `A5C_STEP_IDLE_SECONDS`: stale execution threshold for sweep.
- `A5C_NOW_ISO`: deterministic time for tests.
