# Orchestration Protocol

This document describes the “wire protocol” between the orchestration runner and repo-owned hooks.

The system has three main interfaces:

1) `git a5c run reconcile` produces a JSON plan.
2) `git a5c hook exec` executes plan entries by running step hooks.
3) Reward steps may invoke evidence producer hooks and produce a reward report (scorecard).

All durable state is append-only events under `/.collab/**`.

## Plan output (`run reconcile --json`)

Schema: `spec/schemas/run.reconcile.plan.schema.json`

Example:

```json
{
  "actor": "runner:cli",
  "treeish": "HEAD",
  "plans": [
    {
      "run_id": "run_001",
      "kind": "EXECUTE_STEP",
      "step_id": 1,
      "attempt": 1,
      "step_type": "agent",
      "hook": ".a5c/hooks/steps/agent.js",
      "hook_input": {
        "run_id": "run_001",
        "step_id": 1,
        "attempt": 1,
        "instructions": "Summarize scope and plan.",
        "agent": { "profile": "default" },
        "state": { "run_id": "run_001" },
        "template": { "template_id": "web_feature", "version": "v1" },
        "hook_mapping": {
          "schema": "a5cforge/v1",
          "kind": "hook-mapping",
          "version": "v1",
          "step_hooks": { "agent": "agent/[profile]", "reward": "reward" },
          "evidence_hooks": { "command": "command" }
        }
      },
      "events_to_emit_before": [
        { "kind": "run.step.started", "payload": { "run_id": "run_001", "step_id": 1, "attempt": 1 } }
      ],
      "events_expected_after": ["run.step.completed", "run.step.failed"]
    }
  ]
}
```

## Step hook input (agent + reward)

Schema: `spec/schemas/run.hook.step.input.schema.json`

Notes:

- `state` is the canonical derived state object.
- `template` is the resolved template (base playbook + merge patch).

## Step hook output (agent)

Schema: `spec/schemas/run.hook.step.output.agent.schema.json`

Example:

```json
{
  "ok": true,
  "artifacts": ["artifacts/runs/run_001/step_1/attempt_1/agent_log.txt"],
  "spawn": [{ "playbook": "playbooks/child.yaml@v1" }],
  "links": { "pr": "https://..." }
}
```

## Step hook output (reward)

Schema: `spec/schemas/run.hook.step.output.reward.schema.json`

Two supported modes:

1) **Hook-provided reward report**: reward hook emits `reward_report`.
2) **Runner-computed reward report**: reward hook omits `reward_report`; runner invokes evidence producers and computes the scorecard.

Example (hook-provided):

```json
{
  "ok": true,
  "reward_report": {
    "reward_total": 0.92,
    "signals": {
      "unit": { "pass_fail": true, "score": 1, "severity": "HARD", "evidence": [], "summary": "ok" }
    },
    "notes": ""
  }
}
```

## Evidence producer hook input/output

Input schema: `spec/schemas/run.hook.evidence.input.schema.json`

Output schema: `spec/schemas/run.hook.evidence.output.schema.json`

Evidence object schema: `spec/schemas/evidence.object.schema.json`

## Reward report (“scorecard”)

Reward reports are materialized as events:

- `run.reward.reported` (schema: `spec/schemas/run.reward.reported.schema.json`)

The report body is in `payload.data`.

Schema (report body): `spec/schemas/reward.report.schema.json`

The report supports free-form feedback via `notes`.

## Tooling/scoring

Scoring is deterministic and pure for a given set of evidence.

MVP metric keys used by scoring:

- `pass_fail`: reads `evidence[].metrics.failed` (number)
- `diff_ratio`: reads `evidence[].metrics.diff_ratio` (number)
