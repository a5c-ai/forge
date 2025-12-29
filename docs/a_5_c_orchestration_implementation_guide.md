# A5C Orchestration — CLI Runner Specification + Implementation Guide ("git a5c run")

This single document combines the **spec** and the **implementation guide** for the A5C Git-native orchestration layer using a **CLI runner** model.

> Core principle: **Git is the DB**. The orchestrator is a disposable process that repeatedly reconciles a repo state by appending `.collab/**` event files and/or producing an execution plan.

---

## 0) Invariants (non-negotiable)
- **Durable state is only event files** under `.collab/**` (tracked).
- **Ordering is filename-derived**, not wall-clock time.
- **All decisions are made from a deterministic render**: `render(treeish, inbox_refs[])`.
- **Templates/playbooks MUST be loaded from the same `treeish`** as the render, not the working directory.
- The runner is **crash-safe** and **restartable**: no hidden state.

---

## 1) Terminology
- **Template**: the full run recipe (a playbook) containing typed steps, signals, evidence producers, reward model, breakpoints, CBPs.
- **Playbook**: a reusable template stored in the repo.
- **Run**: an execution instance of a Template; represented as an Issue + run events.
- **Step**: a unit of work in a run. Types: `agent`, `human`, `reward`.
- **Attempt**: execution number for a step: `(run_id, step_id, attempt)`.
- **Breakpoint**: pause that requires human continuation.
- **Conditional Breakpoint (CBP)**: code-like conditional breakpoint evaluated against the **derived state object** (and optionally the candidate transition). CBP *rides on top* of the breakpoint mechanism.
- **Signal**: a reward evaluation unit (unit tests, visual diff, a11y scan…). Signals run by invoking **evidence producers**.
- **Evidence Producer**: an adapter/hook that generates evidence artifacts + structured outputs.

---

## 2) Repository layout

### 2.1 Tracked
- `playbooks/**` — reusable templates
- `signals/**` — shared signal presets (optional)
- `.a5c/hooks/**` — hook scripts/commands (tracked)
- `.a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml` — repo-level hook mapping (tracked)
- `.collab/**` — event log (tracked)
- `artifacts/**` — artifacts/evidence (tracked or untracked by policy; recommended: tracked for audit, optionally LFS)

### 2.2 Untracked convenience
- `.git/a5c/**` — runner caches/journals (wipeable)

---

## 3) Data model: Template (normative)

Templates are JSON/YAML objects. The runner MUST support:
- **repo playbooks** (referenced by path + version), and
- **inline/arbitrary templates** provided per-run.

### 3.1 Template schema (practical, stable)

```json
{
  "template_id": "web_feature",
  "version": "v4",
  "name": "Web Feature Playbook",
  "description": "Reward-driven convergence for UI features.",

  "steps": [
    {
      "step_id": 1,
      "name": "Intake",
      "type": "agent",
      "instructions": "Summarize scope and plan.",
      "breakpoint": {"enabled": false},
      "agent": {"profile": "default"}
    },
    {
      "step_id": 2,
      "name": "Clarify",
      "type": "human",
      "instructions": "Confirm acceptance criteria.",
      "breakpoint": {"enabled": true}
    },
    {
      "step_id": 3,
      "name": "Implement",
      "type": "agent",
      "instructions": "Implement; open PR; add notes.",
      "breakpoint": {"enabled": false},
      "agent": {"profile": "default"},
      "dependencies": {
        "allow_spawn": true,
        "await": "all"
      }
    },
    {
      "step_id": 4,
      "name": "Reward",
      "type": "reward",
      "instructions": "Run signals; produce Reward Report.",
      "breakpoint": {"enabled": false},
      "reward": {
        "signals": ["unit", "a11y", "visual"],
        "policy": {"on_fail": "auto_redo", "redo_target_step_id": 3},
        "thresholds": {"pass": 0.80}
      }
    }
  ],

  "signals": {
    "unit": {
      "severity": "HARD",
      "weight": 0.5,
      "producer": "jest",
      "producer_args": {"cmd": "pnpm test"},
      "scoring": {"mode": "pass_fail"}
    },
    "visual": {
      "severity": "SOFT",
      "weight": 0.3,
      "producer": "playwright_screens",
      "producer_args": {"cmd": "pnpm test:visual"},
      "scoring": {"mode": "diff_ratio", "pass_if_lte": 0.02}
    },
    "a11y": {
      "severity": "HARD",
      "weight": 0.2,
      "producer": "axe",
      "producer_args": {"cmd": "pnpm test:a11y"},
      "scoring": {"mode": "pass_fail"}
    }
  },

  "evidence_producers": {
    "jest": {
      "kind": "command",
      "default_outputs": ["unit_report"]
    },
    "playwright_screens": {
      "kind": "command",
      "default_outputs": ["screenshots", "diffs", "visual_report"]
    },
    "axe": {
      "kind": "command",
      "default_outputs": ["a11y_report"]
    }
  },

  "breakpoints": {
    "overrides": {
      "allow": true
    }
  },

  "cbp": [
    {
      "id": "pause_on_high_reward",
      "scope": "step",
      "step_id": 4,
      "when": "state.reward.latest.reward_total >= 0.85",
      "message": "High reward achieved — pause for sign-off"
    }
  ]
}
```

### 3.2 Step types (required behavior)
- `agent`: work executed via a hook.
- `human`: pauses at breakpoint (almost always enabled by default).
- `reward`: executed via a hook; runs signals; emits Reward Report.

### 3.3 Full per-run template override (required)
Runs MUST be able to:
- reference a repo playbook AND override any part (deep patch), or
- supply an entire inline template.

Recommended deterministic override mechanism:
- **JSON Merge Patch** (RFC 7396) applied over the base template.

---

## 4) Breakpoints + CBP (normative)

### 4.1 Unified breakpoint evaluation
There is one pause mechanism: **breakpoint**.

```text
effective_breakpoint(step, state, transition) =
  step.breakpoint.enabled
  OR breakpoint_override_for_step
  OR any(CBP evaluates true)
```

If `effective_breakpoint` is true at a pause point, the run enters WAIT_HUMAN.

### 4.2 CBP definition
CBP is a boolean expression evaluated against:
- `state` (canonical derived state object)
- optional `transition` (candidate next action)

CBP *rides on top* of the breakpoint mechanism by contributing to `effective_breakpoint`.

### 4.3 Expression engine
Implement `expr.eval(string, {state, transition}) -> boolean` with a restricted, deterministic evaluator.
- No I/O, no time, no randomness.
- Failures evaluate to `false` and emit a warning event.

---

## 5) Event model (minimum viable contracts)

Events are JSON files under:

```text
.collab/runs/<run_id>/events/<seq>__<event_type>__s<step_id>__a<attempt>__<actor>.json
```

### 5.1 Required events
- `issue.event.created` (run creation)
- `run.step.scheduled`
- `run.step.started`
- `run.step.completed`
- `run.step.failed`
- `run.human.waiting`
- `run.human.resumed`
- `run.human.completed_step`
- `run.reward.reported`
- `run.step.redo_requested`
- `run.dep.spawned`
- `run.dep.completed`
- `run.warning` (e.g., CBP expression error)

### 5.2 Event envelope

```json
{
  "type": "run.step.completed",
  "run_id": "run_001",
  "step_id": 3,
  "attempt": 1,
  "actor": "runner:tal-laptop",
  "data": {},
  "evidence": ["artifacts/runs/run_001/step_3/attempt_1/log.txt"],
  "links": {}
}
```

### 5.3 Reward Report payload (required)

```json
{
  "type": "run.reward.reported",
  "run_id": "run_001",
  "step_id": 4,
  "attempt": 1,
  "actor": "hook:reward",
  "data": {
    "reward_total": 0.92,
    "pass_threshold": 0.80,
    "decision": "pass|redo|escalate_bp",
    "signals": {
      "unit": {"severity": "HARD", "pass_fail": true, "score": 1.0, "evidence": ["..."], "summary": "All tests passed"},
      "visual": {"severity": "SOFT", "pass_fail": false, "score": 0.6, "evidence": ["..."], "summary": "2% diff"}
    },
    "notes": ""
  },
  "evidence": []
}
```

---

## 6) Canonical derived state object (CBP target)
The runner MUST derive a stable state object, minimal and recomputable:

```json
{
  "run_id": "run_001",
  "status": "ACTIVE|WAIT_HUMAN|WAIT_DEPS|DONE|CANCELLED",
  "current": {"step_id": 4, "attempt": 1, "phase": "IDLE|RUNNING|DONE|FAILED"},
  "resolved_template": {"template_id": "web_feature", "version": "v4"},
  "waiting": {"kind": "human|deps", "reason": "breakpoint|cbp|reward_fail|manual"},
  "deps": {"pending": [], "completed": []},
  "reward": {"latest": {"step_id": 4, "attempt": 1, "reward_total": 0.92, "signals": {}}}
}
```

---

## 7) Hook-based execution model (required)

**Assumption:** the runner does not directly invoke agents/tools. It produces an **Execution Plan**. A separate command executes that plan via repo-defined hooks.

### 7.1 Commands (normative)

```bash
# plan the next actions (bounded)
git a5c run reconcile [--max-transitions N] [--dry-run] [--json]

# execute a produced plan via hooks
git a5c hook exec --plan <path|->

# convenience: reconcile + exec in one go (optional)
git a5c run tick [--max-transitions N]
```

### 7.2 Reconcile outputs
`git a5c run reconcile --json` MUST output a JSON object to stdout:

```json
{
  "actor": "runner:tal-laptop",
  "treeish": "HEAD",
  "plans": [
    {
      "run_id": "run_001",
      "transition_id": "t_0007",
      "kind": "EXECUTE_STEP",
      "step_id": 3,
      "attempt": 1,
      "step_type": "agent",
      "hook": "hooks/steps/agent.sh",
      "hook_input": {
        "run_id": "run_001",
        "step_id": 3,
        "attempt": 1,
        "instructions": "Implement...",
        "state": {"...": "..."},
        "template": {"...": "..."}
      },
      "events_to_emit_before": [
        {"type": "run.step.started", "run_id": "run_001", "step_id": 3, "attempt": 1, "actor": "runner:tal-laptop", "data": {}}
      ],
      "events_expected_after": [
        "run.step.completed",
        "run.step.failed"
      ]
    }
  ]
}
```

Notes:
- The runner MAY emit some events itself (e.g., `run.human.waiting`) when no hook execution is needed.
- For executable transitions, the plan includes **which hook to run** and the **hook input**.

### 7.3 Hook execution command

```bash
git a5c hook exec --plan -
```

Behavior:
1) Reads plan JSON.
2) For each planned transition:
   - writes `events_to_emit_before` as event files (append-only)
   - runs the hook command with `hook_input` via stdin
   - validates hook output
   - appends terminal events (`completed`/`failed`/`reward.reported`) emitted by hook exec based on hook output.

### 7.4 Hook definitions in repo (tracked)
Hooks are repo-owned and versioned:

```text
.a5c/hooks/
  steps/
    agent.sh
    reward.sh
  evidence/
    command.sh
    parse_junit.sh
    visual_diff.sh
```

Hook contract:
- Input: JSON via stdin.
- Output: JSON via stdout.
- Exit code nonzero indicates failure (hook exec converts to `run.step.failed`).

#### 7.4.1 Step hook output schema (agent)

```json
{
  "ok": true,
  "artifacts": ["artifacts/runs/run_001/step_3/attempt_1/agent_log.txt"],
  "spawn": [
    {"playbook": "playbooks/unit_fix.yaml@v2"}
  ],
  "links": {"pr": "..."}
}
```

Spawn contract note (MVP): implementations may also emit `{ "template_ref": "path@version" }`.
The runner SHOULD converge on one canonical spawn shape and validate it.

#### 7.4.2 Step hook output schema (reward)

```json
{
  "ok": true,
  "reward_report": {
    "reward_total": 0.92,
    "pass_threshold": 0.80,
    "decision": "pass|redo|escalate_bp",
    "signals": {
      "unit": {"pass_fail": true, "score": 1.0, "severity": "HARD", "evidence": ["..."], "summary": ""}
    },
    "notes": ""
  },
  "artifacts": ["artifacts/runs/run_001/step_4/attempt_1/reward_report.json"]
}
```

Reward responsibility note (MVP):

- If the reward hook emits `reward_report`, the runner records it.
- If the reward hook omits `reward_report`, the runner MAY compute a reward report by invoking evidence producers and applying pure scoring.

The spec should explicitly allow one or both modes and define precedence (recommended: prefer hook-provided report when present).

---

## 8) Evidence producers (required)

Signals do not run tools directly; they invoke **evidence producers**.

### 8.1 Evidence producer definition
Each producer definition MUST include:
- `producer_id`
- `kind` (MVP: `command`)
- `default_outputs[]`

Producer hook resolution is repo-level (not embedded in the playbook):

- The runner loads `/.a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml` from the same `treeish`.
- Evidence producer hooks are resolved by `producer.kind` (MVP: `command`).

Mapping values are hook *names* (not file paths). The runner resolves:

- step hook `reward` -> `.a5c/hooks/steps/reward.js`
- step hook `agent/[profile]` -> `.a5c/hooks/steps/agent/<profile>.js`
- evidence hook `command` -> `.a5c/hooks/evidence/command.js`

### 8.2 Evidence object schema
Producers output structured evidence objects:

```json
{
  "evidence_id": "unit_report",
  "kind": "report|diff|log|artifact|metric",
  "paths": ["artifacts/..."],
  "summary": "...",
  "metrics": {"failed": 0, "passed": 120},
  "mime": "application/json"
}
```

### 8.3 Producer hook I/O
Producer input:

```json
{
  "run_id": "run_001",
  "step_id": 4,
  "attempt": 1,
  "signal_id": "unit",
  "producer": "jest",
  "producer_args": {"cmd": "pnpm test"},
  "artifact_root": "artifacts/runs/run_001/step_4/attempt_1"
}
```

Producer output:

```json
{
  "ok": true,
  "evidence": [
    {"evidence_id": "unit_report", "kind": "report", "paths": [".../junit.xml"], "metrics": {"failed": 0}}
  ]
}
```

### 8.4 Signal scoring (pure)
The reward hook (or a shared library / runner scoring module) computes:
- `pass_fail`
- `score ∈ [0,1]`

from the evidence objects using the template’s `scoring` rule.

#### 8.4.1 Required evidence metric keys (MVP)

To keep scoring deterministic and easy to validate, each scoring mode MUST specify what evidence metrics it uses.

- `pass_fail`: uses `evidence[].metrics.failed` (number). If missing, treat as failure.
- `diff_ratio`: uses `evidence[].metrics.diff_ratio` (number). If missing, treat as failure.

These are MVP defaults; richer evidence schemas can be added later.

---

## 9) Reconcile algorithm (normative)

### 9.1 Steps
For each eligible run (or a filtered run):
1) `view = render(treeish, inbox_refs)`
2) Load playbook/template from the same `treeish` as the view (NOT the working directory)
3) `resolved_template = resolve(base_template or inline_template, patches)`
4) `state = derive(view.events, resolved_template)`
5) `transition = plan(state)`
6) If transition is non-executable (e.g., WAIT_HUMAN), emit events immediately.
7) If transition requires execution, output a plan entry for `git a5c hook exec`.

### 9.1.1 Determinism requirement

Reconcile MUST be deterministic for a given `{treeish, inbox_refs}`.
If the working directory differs from `treeish`, reconcile still uses the `treeish` contents.

### 9.2 Idempotency checks
The planner MUST treat attempts as terminal when any terminal event exists:
- agent step terminal: `run.step.completed|failed`
- reward step terminal: `run.reward.reported`

If terminal exists, plan the next transition.

### 9.3 Dependency handling (MVP)
- Agent hooks may return `spawn[]` items.
- Hook exec dispatches dependents (creates new runs) and appends `run.dep.spawned`.

Dependency unblocking note (MVP): to determine if a dependent is DONE, the runner derives the dependent run state.
This requires that the dependent run has a `run.dispatched` event with a resolvable playbook/template reference.
- Parent is blocked until dependents are DONE (derive-based) → runner returns exit code `30` when blocked.

---

## 10) Concrete examples (fixtures + tests)

### 10.1 Example: dispatch with repo playbook + deep override

```bash
git a5c run dispatch \
  --playbook playbooks/web_feature.yaml@v4 \
  --title "Add pricing badge" \
  --input "Add a pricing badge on the plans page" \
  --overrides-file fixtures/overrides/high_reward_pause.json
```

`fixtures/overrides/high_reward_pause.json`:

```json
{
  "template_patch": {
    "signals": {
      "visual": {"severity": "SOFT", "weight": 0.3, "producer": "playwright_screens", "producer_args": {"cmd": "pnpm test:visual"}, "scoring": {"mode": "diff_ratio", "pass_if_lte": 0.01}}
    },
    "cbp": [
      {"id": "pause_on_high_reward", "scope": "step", "step_id": 4, "when": "state.reward.latest.reward_total >= 0.85"}
    ]
  }
}
```

### 10.2 Example: reconcile → execute via hook

```bash
# plan one transition
git a5c run reconcile --max-transitions 1 --json > /tmp/plan.json

# execute it
git a5c hook exec --plan /tmp/plan.json
```

### 10.3 Fixture repo layout

```text
fixtures/repo_min/
  playbooks/
    web_feature.yaml
  .a5c/
    hooks/
      steps/
        agent.sh
        reward.sh
      evidence/
        command.sh
  .collab/
    runs/
      run_001/
        events/
          000001__issue.event.created__s0__a0__tester.json
  artifacts/
    runs/
      run_001/
        step_4/
          attempt_1/
            reward_report.json
```

### 10.4 Concrete test cases (ready for fixtures)

**A) Derive golden**
- Given: `fixtures/repo_min` + injected events
- Expect: `state.json` matches `fixtures/expected/state_00000N.json`

**B) Plan golden: CBP rides on breakpoints**
- Set CBP `when: "true"` for step 4.
- Expect: planner outputs WAIT_HUMAN (effective_breakpoint=true) even if `breakpoint.enabled=false`.

**C) Plan golden: redo after reward fail**
- Provide Reward Report with `reward_total=0.6`, threshold `0.8`, policy `auto_redo redo_target_step_id=3`.
- Expect: transition `REDO_STEP(3)` and attempt increment for step 3.

**D) Hook exec writes terminal events**
- Plan an EXECUTE_STEP for agent step.
- Hook returns `{ok:true}`.
- Expect: event log includes `run.step.started` then `run.step.completed` for that attempt.

**E) Full inline template dispatch**
- Dispatch with `--template-file fixtures/templates/inline_bugfix.json`.
- Expect: derive uses inline template and produces correct next transition.

---

## 11) Minimal MVP build order
1) deterministic event writer + filename sequencing
2) template loader + inline template + merge-patch overrides
3) renderer wrapper + view normalization
4) pure derive (canonical state object)
5) pure planner (transitions + effective_breakpoint + CBP)
6) reconcile JSON plan output
7) hook exec: step hooks (agent)
8) hook exec: reward hooks + evidence producer hooks
9) auto-redo + attempt increments
10) dependencies: spawn + wait-all

---

## 12) Notes on extensibility
- Multi-runner safety can be added later via claims/heartbeats without changing the plan/hook contracts.
- Evidence producers can expand beyond `command` (e.g., API call, parser, diff engine), as long as they are hook-driven and deterministic in scoring.

---

## 13) Robustness: dead runs, dead executions, and recovery (required)

This section defines how the system detects and recovers from:
- a **stuck run** (no progress), and
- a **stuck execution** (a planned step started but the hook/agent died).

> Key idea: **time is operational, not ordering**. We never sort by timestamps, but we may use wall-clock time to decide that something is stale. Any such decision MUST be recorded as an event, making the final history reproducible.

### 13.1 Liveness signals
There are two complementary liveness signals:

1) **Step execution keep-alives** (heartbeats)
- Produced by `git a5c hook exec` while a step is running.

2) **Claims/leases** (optional, enables safe concurrency)
- A runner (or hook exec) may acquire a lease on `(run_id, step_id, attempt)`.

MVP can ship with (1) only, and add (2) later.

### 13.2 Add these events (robustness set)

- `run.step.heartbeat` — keep-alive for an in-flight attempt
- `run.step.exec.started` — emitted by hook exec (optional) to distinguish “started by runner” vs “started execution”
- `run.step.exec.progress` — optional progress snapshots (phase/message)
- `run.step.exec.timed_out` — declared stale by runner (or sweeper)
- `run.step.exec.abandoned` — declared unrecoverable (exceeded retries/TTL)
- `run.stalled` — run-level idle detection

All of the above MUST be append-only events.

#### 13.2.1 Heartbeat payload

```json
{
  "type": "run.step.heartbeat",
  "run_id": "run_001",
  "step_id": 3,
  "attempt": 1,
  "actor": "hookexec:tal-laptop",
  "data": {
    "seq": 4,
    "message": "running tests",
    "observed_at": "2025-12-26T10:21:04+02:00"
  }
}
```

Notes:
- `observed_at` is allowed because it is not used for ordering; only to evaluate staleness.
- `seq` is per-attempt monotonic (helps diagnose missing beats).

### 13.3 Timeouts and retry policy (template-level)
Add an optional `timeouts` and `retries` block in the template:

```json
{
  "timeouts": {
    "step_exec_seconds": 900,
    "step_idle_seconds": 180,
    "run_idle_seconds": 3600
  },
  "retries": {
    "max_attempts_per_step": 3,
    "on_timeout": "redo|pause|fail"
  }
}
```

Defaults (suggested):
- `step_exec_seconds`: 15 min
- `step_idle_seconds`: 3 min (heartbeat gap)
- `run_idle_seconds`: 60 min
- `max_attempts_per_step`: 3
- `on_timeout`: `redo` for agent/reward steps, `pause` for human steps

### 13.4 How the runner detects a dead execution
A step attempt is considered **stale** if:
- state indicates it is RUNNING (started event exists; no terminal event), AND
- the last heartbeat is older than `step_idle_seconds`, OR
- the execution age (from first exec marker/heartbeat) exceeds `step_exec_seconds`.

When stale:
1) emit `run.step.exec.timed_out` (with reason + observed_at)
2) apply recovery policy:
   - `redo` → plan `REDO_STEP(target_step)` and increment attempt
   - `pause` → plan/emit `run.human.waiting` (reason: timeout)
   - `fail` → emit `run.step.failed` (reason: timeout)

### 13.5 How the runner detects a dead/stalled run
A run is considered **stalled** if:
- it is ACTIVE (not WAIT_HUMAN/WAIT_DEPS/DONE/CANCELLED), AND
- there has been no progress event for `run_idle_seconds`.

On stall:
- emit `run.stalled` (with summary of why)
- default action: `WAIT_HUMAN` (it becomes visible and safe)
- optional template policy: auto-cancel or auto-redo last agent step

### 13.6 `git a5c run sweep` (recommended)
Add a small command dedicated to operational cleanup:

```bash
git a5c run sweep --stale --emit --max 50
```

Behavior:
- scans for stale executions and stalled runs
- emits the corresponding timeout/stall events
- does not execute hooks (it only marks + queues recovery)

Then Studio/automation calls:

```bash
git a5c run reconcile --max-transitions 1 --json | git a5c hook exec --plan -
```

---

## 14) Hook exec keep-alive protocol (required)

Because actual execution is done through hooks, `git a5c hook exec` MUST:

1) Emit `run.step.exec.started` immediately after writing `events_to_emit_before`.
2) While the hook is running, emit `run.step.heartbeat` at a fixed cadence (e.g., every 30s).
3) On successful completion, emit terminal event(s) (`run.step.completed` or `run.reward.reported`).
4) On failure/kill/timeout, emit `run.step.failed` (reason: exec_failure) OR allow the runner to time it out (see below).

### 14.1 Practical process model
- Hook exec spawns the step hook process.
- A watchdog thread/timer writes heartbeat events periodically.
- If the hook process exits, heartbeat stops and terminal is emitted.

### 14.2 What if hook exec dies?
If hook exec itself crashes:
- heartbeats stop
- the next `reconcile` or `sweep` detects staleness and applies the configured recovery policy.

This makes the system robust even without a long-lived daemon.

---

## 15) Concrete robustness fixtures and tests

### 15.1 Fixture: dead agent execution (no heartbeat)
Events:
- `run.step.started` for (step=3, attempt=1)
- **no** `run.step.heartbeat`

Expected:
- `sweep` emits `run.step.exec.timed_out`
- `reconcile` plans `REDO_STEP(step=3)` with attempt=2

### 15.2 Fixture: heartbeats present, then stop
Events:
- started
- heartbeat seq=1..3
- then no more

Expected after `step_idle_seconds`:
- timeout event
- redo or pause depending on policy

### 15.3 Fixture: stalled run (no progress)
Events:
- created
- scheduled
- (nothing else)

Expected after `run_idle_seconds`:
- `run.stalled`
- `run.human.waiting` (reason: stalled)

### 15.4 Fixture: reward pass but CBP pauses
Events:
- reward.reported with reward_total=0.92
- CBP condition true

Expected:
- effective_breakpoint true → WAIT_HUMAN

---

## 16) Implementation notes (how to add this without breaking determinism)
- The renderer still orders events by filename.
- Staleness decisions depend on wall-clock, but are **materialized as events**. Once emitted, the history is replayable.
- Keep-alive events are small and frequent; consider a policy:
  - write heartbeats to `.collab/**` only every N seconds, and
  - optionally also write a fast untracked heartbeat journal under `.git/a5c/**` for UI smoothness.
