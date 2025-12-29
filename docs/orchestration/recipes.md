# Orchestration recipes

These are copy/paste workflows that use multiple commands together.

## Recipe: minimal run (repo-min)

Use the template repo:

`docs/orchestration/examples/repo-min/`

```bash
# One command: dispatch + tick loop
git a5c run playbook --playbook playbooks/web_feature.yaml@v1 --run-id run_001 --max-iterations 50

# Equivalent low-level commands
git a5c run dispatch --playbook playbooks/web_feature.yaml@v1 --run-id run_001
git a5c run tick --run-id run_001 --max-transitions 10
```

If your hooks shell out to the CLI, either:

- ensure `git-a5c` is on your `PATH`, or
- set `A5C_CLI=/abs/path/to/git-a5c.js`

## Recipe: issue -> dispatch playbook -> agent prompt -> agent run -> evidence score

This workflow uses an issue's event log as part of the agent prompt context, then computes a reward score from evidence producers.

Example fixture repo:

`fixtures/repo-e2e-issue-agent-score/`

```bash
# 1) Create an issue (this writes to .collab/issues/<id>/events/...)
git a5c issue new --id issue_100 --title "E2E" --body "Do thing" --commit

# 2) Tell the agent hook which issue to include in the prompt
export A5C_TEST_ISSUE_ID=issue_100

# 3) Dispatch and run
git a5c run dispatch --playbook playbooks/issue_agent_score.yaml@v1 --run-id run_050
git a5c run tick --run-id run_050 --max-transitions 10
```

What happens:

- Step 1 agent hook runs `agent generate-context` to render `.a5c/main.md`.
- The prompt template includes the issue event JSON via `git://.../.collab/issues/...`.
- Step 1 agent hook then calls `agent run` via `.a5c/predefined.yaml`.
- Step 2 reward hook omits `reward_report`, so the executor runs evidence hooks and computes `run.reward.reported`.

## Recipe: score fails -> auto_redo agent -> score passes

Example fixture repo:

`fixtures/repo-e2e-issue-agent-score/`

```bash
git a5c issue new --id issue_100 --title "E2E" --body "Do thing" --commit

export A5C_TEST_ISSUE_ID=issue_100

# First scoring run fails (visual diff ratio too high)
export A5C_TEST_DIFF_RATIO=0.5
git a5c run dispatch --playbook playbooks/issue_agent_score_redo.yaml@v1 --run-id run_051
git a5c run tick --run-id run_051 --max-transitions 2

# Agent step is re-run automatically; then score again with a passing ratio
export A5C_TEST_DIFF_RATIO=0.01
git a5c run tick --run-id run_051 --max-transitions 2
```

## Recipe: deps wait (spawn dependent runs)

Example fixture repo:

`fixtures/repo-orchestration-deps-wait/`

```bash
git a5c run dispatch --playbook playbooks/parent.yaml@v1 --run-id run_010

# Executes the parent until it blocks on deps (exit code 30)
git a5c run tick --run-id run_010 --max-transitions 3

# Find the dependent run id from .collab/runs/run_010/events/*run.dep.spawned*
# Then run the dependent
git a5c run tick --run-id <dep_run_id> --max-transitions 10

# Reconcile parent (should append run.dep.completed)
git a5c run reconcile --run-id run_010

# Continue the parent
git a5c run tick --run-id run_010 --max-transitions 10
```

## Recipe: sweep stale execs -> resume -> continue

Example fixture repo:

`fixtures/repo-orchestration-sweep-stale/`

```bash
export A5C_NOW_ISO=2025-12-26T00:10:00.000Z
export A5C_STEP_IDLE_SECONDS=60

git a5c run sweep --max 10
git a5c run resume --run-id run_001 -m "resume after timeout"
git a5c run tick --run-id run_001 --max-transitions 3
```

## Recipe: parse Codex logs

If you run an agent via Codex and want JSONL events for downstream processing:

```bash
cat codex.log | git a5c parse --type codex --out artifacts/codex.jsonl
```

More examples: `docs/cli/parse.md`.

