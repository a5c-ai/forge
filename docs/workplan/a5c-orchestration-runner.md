# Workplan: A5C Orchestration (CLI Runner + Hooks)

This workplan scopes the repo changes needed to implement the orchestration layer described in `docs/a_5_c_orchestration_implementation_guide.md`, focusing on **SDK + CLI**, plus required **docs, specs, fixtures, and tests**. No implementation is done in this change.

## Goals
- Add a Git-native orchestration layer where durable state is append-only events under `.collab/**`.
- Implement a **runner/planner** (`git a5c run reconcile`) that is deterministic given a rendered view.
- Implement a **hook executor** (`git a5c hook exec`) that executes planned transitions via repo-owned hooks under `.a5c/hooks/**`.
- Support playbook/templates (`playbooks/**`), signals/evidence producers, reward scoring, breakpoints + CBP.
- Keep the system crash-safe and restartable: no hidden durable state.

## Non-goals (for initial enhancement)
- Multi-runner leasing/claims (optional future); MVP relies on heartbeats + sweep.
- A full UI for orchestration; CLI + event files are the primary interface.
- Non-`command` evidence producers (API-based, remote runners) beyond the hook contract.

## Current repo alignment (what exists today)
- Events are already loaded from `.collab/**` via `@a5c-ai/sdk` snapshot loading.
- Event ordering currently assumes filename grammar like `1734628200000_actor_0001.kind.json`.
- CLI already supports reading/writing issue/pr events and auto-pull-on-read.
- Spec folder contains JSON Schemas for existing `*.schema.json` event kinds.

The orchestration guide introduces **new event kinds**, **new filename grammar for run events**, and new CLI commands. The work here will extend existing patterns rather than replacing them.

## Key design decisions to settle early
1) **Run event filename grammar vs existing ordering**
   - Guide uses: `.collab/runs/<run_id>/events/<seq>__<event_type>__s<step_id>__a<attempt>__<actor>.json`.
   - Current SDK comparator (`compareEventFilesByPath`) will throw if filenames don’t match the timestamp grammar.
   - Work needed:
     - Extend ordering to support *both* grammars, or
     - Adopt the existing timestamp-based grammar for run events.
   - Recommendation: support both grammars (backwards compatible; allows the guide’s seq-based runs without breaking existing issue/pr events).

2) **Event envelope shape**
   - Guide shows a `{ type, run_id, ... }` envelope.
   - Repo currently standardizes on `{ schema: "a5cforge/v1", kind, id, time, actor, payload }`.
   - Recommendation: keep the existing envelope and represent guide fields in `payload` (and/or mirror them at top-level if needed later).

3) **Template format + override mechanism**
   - Support YAML + JSON playbooks.
   - Implement override via RFC 7396 JSON Merge Patch.
   - Decide whether template `version` participates in dispatch idempotency (likely informational only; actual resolved template is embedded in run creation event).

## Planned CLI surface area

### New commands
- `git a5c run dispatch ...`
  - Create a run (likely represented as an `issue.event.created` + run metadata) and write initial run events.
  - Inputs: `--playbook <path>@<ver>` and/or `--template-file <path>`, `--overrides-file <path>`.

- `git a5c run reconcile [--max-transitions N] [--dry-run] [--json] [--run-id <id>]`
  - Pure planning step: loads view (`treeish` + optional inbox refs), resolves templates, derives run state, outputs a bounded list of transitions.
  - May also emit non-executable events (e.g., `run.human.waiting`) when planning hits a pause.

- `git a5c run tick [--max-transitions N]`
  - Convenience wrapper for: `reconcile --json | hook exec --plan -`.

- `git a5c run sweep [--stale] [--emit] [--max N]`
  - Operational command: detects stale executions and stalled runs; emits timeout/stall events.

- `git a5c hook exec --plan <path|-> [--dry-run]`
  - Executes planned transitions:
    - writes “before” events
    - runs step hooks with `hook_input` on stdin
    - writes terminal events + reward reports
    - emits periodic `run.step.heartbeat` while hook runs

### Exit codes
- `0`: success/no work
- `30`: blocked on dependencies (as suggested by guide)
- `2`: usage / invalid input
- other non-zero: operational errors

## SDK work breakdown

### A) Template + playbook support (`@a5c-ai/sdk`)
- Add a `template/` module:
  - `loadPlaybook(path, treeish|fs)` supporting YAML/JSON
  - `applyMergePatch(template, patch)` (RFC 7396)
  - `resolveTemplate({ baseRef?, inline?, patch? }) -> resolvedTemplate`
- Add TypeScript types for Template, Step, Signals, Evidence Producers, Reward Policy, Breakpoints, CBP.
- Add JSON Schema(s) for template files under `spec/schemas/`.

### B) Run event types + validation
- Define canonical run event kinds listed in the guide (at minimum).
- Decide payload shape (recommended):
  - `payload.runId`, `payload.stepId`, `payload.attempt`, etc.
  - Include `payload.evidence[]`, `payload.links{}` as needed.
- Add JSON Schemas for run events in `spec/schemas/` and update `spec/schemas/kind-map.v1.json`.

### C) Run rendering + derivation (pure)
- Add `orchestration/derive.ts`:
  - Input: ordered event stream + resolved template
  - Output: canonical derived state object (as per guide section 6)
  - Rules:
    - Terminal attempt detection
    - WAIT_HUMAN / WAIT_DEPS / ACTIVE / DONE transitions
    - Reward state + last reward report

### D) Planner (pure)
- Add `orchestration/plan.ts`:
  - Input: derived state, resolved template
  - Output: a single “next transition” or `none`
  - Implements `effective_breakpoint` logic:
    - step breakpoint
    - override
    - CBP (`expr.eval`) contributions
  - Produces an execution plan entry for executable transitions:
    - `kind: EXECUTE_STEP`
    - hook path
    - hook input JSON payload
    - `events_to_emit_before`, `events_expected_after`

### E) Deterministic expression engine for CBP
- Add `expr/` module:
  - Support: literals, boolean ops, comparisons, numeric ops (optional), property access (`state.reward.latest.reward_total`), parentheses.
  - No I/O, no time, no randomness.
  - Fail-closed: expression errors evaluate to `false` and can be surfaced as `run.warning` in reconcile.

### F) Event ordering support (compat)
- Extend `compareEventFilesByPath` to support run-event filename grammar (seq-based) without breaking existing timestamp-based events.
  - If both filenames match old grammar: keep current ordering.
  - If both match run grammar: order by seq, then event_type, then s/a, then actor.
  - If mixed/unknown: fall back to lexicographic by full path (stable) and/or group by directory.

## CLI work breakdown (`packages/cli`)

### A) Command plumbing
- Add new handlers:
  - `packages/cli/src/commands/run.ts` (subcommands: dispatch, reconcile, tick, sweep)
  - `packages/cli/src/commands/hookExec.ts` (or `hook.ts`) for `hook exec`
- Extend `packages/cli/src/run.ts` to register new handlers.
- Extend `packages/cli/src/args.ts` to parse flags used by the new commands.

### B) `run dispatch`
- Resolve template:
  - load playbook from repo tree or working dir
  - apply overrides
  - create a new `run_id`
- Write initial events under `.collab/runs/<run_id>/events/...`.
- Optionally also create a user-visible issue event linking to run id (if desired for discoverability).

### C) `run reconcile`
- Load snapshot view (`treeish`, `inboxRefs`).
- For each eligible run:
  - resolve template
  - derive state
  - plan next transition
  - emit non-exec events immediately when needed
- Output JSON plan when `--json`.

### D) `hook exec`
- Read plan JSON from file/stdin.
- For each plan entry:
  - write `events_to_emit_before`
  - emit `run.step.exec.started`
  - run step hook (`.a5c/hooks/...`) with stdin = `hook_input`
  - emit periodic `run.step.heartbeat` while the hook runs
  - validate hook output and emit terminal event(s):
    - agent step: `run.step.completed` / `run.step.failed`
    - reward step: `run.reward.reported` (and possibly `run.step.failed` if needed)
  - handle spawn/deps if hook returns `spawn[]`

- `git a5c agent run ...` (predefined agent CLIs)
  - Runs a repo-configured external agent CLI (for local “bring your own agent” workflows).
  - Reads `/.a5c/predefined.yaml` for profiles/providers.
  - Supports an override config via `--config <path|file://...|github://...>` merged on top.
  - Templating context (usable in `cli_command`, `install`, `cli_params`, and `envs`):
    - `{{prompt_path}}`, `{{output_last_message_path}}`, `{{model}}`, `{{mcp_config}}`, `{{envs.*}}`
  - Writes a canonical “last message” output file and optionally copies it to `--out`.

- `git a5c agent generate-context ...` (prompt/context templating)
  - Renders a Markdown template (default: `.a5c/main.md`) against an event JSON payload.
  - Supports includes, conditionals, loops, printers (`#printJSON`, `#printYAML`, `#printXML`), and expression evaluation.
  - Resolves template URIs from `file://`, `github://...`, and `git://<ref>/<path>` (repo-local) including glob patterns.

- `git a5c parse --type codex ...` (log parser)
  - Converts Codex CLI stdout into a JSONL stream for downstream processing.
  - Supports `--out` for a JSONL file and `--pretty` for pretty-printed JSON.

### E) Safety + determinism controls
- Ensure `--dry-run` never writes events.
- Ensure all written event filenames follow the selected grammar and are strictly monotonic within a run.
- Keep “operational time” (heartbeats/timeouts) materialized as events.

## Docs work breakdown

### A) Overview and user docs
- Add `docs/orchestration/` with:
  - CLI usage quickstart (`dispatch`, `reconcile`, `hook exec`, `tick`, `sweep`)
  - Playbook authoring guide (steps, signals, reward policies, CBP examples)
  - Hook authoring guide (step hooks, evidence hooks, expected JSON I/O)
  - Troubleshooting (stale executions, forced pause, redo)

### B) Repo templates and examples
- Add example playbooks under `fixtures/` or `docs/examples/`.
- Provide a minimal `.a5c/hooks/**` sample implementation for local testing (POSIX + Windows notes).

## Spec work breakdown (`spec/`)
- Add JSON Schemas for:
  - template/playbook
  - execution plan JSON emitted by `run reconcile --json`
  - hook input/output payloads
  - all new run event kinds (`run.step.*`, `run.human.*`, `run.reward.reported`, `run.warning`, etc.)
- Update `kind-map.v1.json` and any validation tooling to include the new kinds.

### Implementation notes (added after MVP build)

During implementation we found it valuable to add additional “contract” schemas and validate them in tests:

- Evidence object schema (`evidence.object.schema.json`)
- Step hook input schema (`run.hook.step.input.schema.json`)
- Evidence hook input/output schemas (`run.hook.evidence.*.schema.json`)
- Reconcile plan envelope schema (`run.reconcile.plan.schema.json`)

These schemas are not emitted as `.collab` events directly, but act as guardrails for runner/hook evolution.

## Test + fixtures work breakdown

### A) Fixtures
- Add a minimal orchestration fixture repo (mirroring guide section 10.3):
  - `fixtures/repo-orchestration-min/`
    - `playbooks/web_feature.yaml`
    - `.a5c/hooks/**` dummy hooks for agent/reward/evidence
    - `.collab/runs/run_001/events/...` baseline
- Add `fixtures/expected/` derived state JSON snapshots.

### B) SDK tests (vitest)
- Derive golden tests:
  - `derive(events, template) -> state` matches expected JSON.
- Planner golden tests:
  - CBP forces breakpoint even when step breakpoint disabled.
  - reward fail triggers redo of target step.
- Expression engine tests:
  - allowed syntax, property access, error handling.
- Ordering tests:
  - mixed old event filenames + run seq filenames do not crash; ordering is stable.

### C) CLI integration tests (vitest)
- `run reconcile --json` produces expected plan output on fixture repo.
- `hook exec` writes started/completed events when executing a dummy hook.
- heartbeat emission (can be time-controlled using an injected clock / env var similar to `A5C_NOW_ISO`).
- sweep detects stale attempts and emits timeout events; reconcile plans recovery.

## Suggested implementation phases (deliverable-oriented)

### Phase 1 — Contracts + pure core
- SDK: types + template loader + merge patch.
- SDK: derive + planner + expr engine (pure functions only).
- Spec: schemas for template + run events + plan JSON.
- Tests: derive/planner/expr golden tests.

### Phase 2 — CLI reconcile + plan output
- CLI: `run reconcile` (read-only planning + optional emission of non-exec events).
- Fixtures: minimal repo + expected plan JSON.
- Tests: CLI reconcile integration.

#### Phase 2.1 — Deterministic playbook loading (missed in initial plan)

During implementation we found `run reconcile` reading playbooks from the **working directory** can break the core invariant that decisions are derived from `render(treeish, inbox_refs)`.

- Update playbook loading to read from the same `treeish` as the snapshot (e.g. via `git show <treeish>:<path>` or a shared SDK helper).
- Add a regression test: modify working tree playbook without committing; `run reconcile --treeish HEAD` (or equivalent) must still plan using `HEAD`.

#### Phase 2.2 — Plan schema validation (added during implementation)

- Add `spec/schemas/run.reconcile.plan.schema.json`.
- Add a CLI integration test validating `run reconcile --json` against the schema.

### Phase 3 — Hook exec MVP
- CLI: `hook exec` executes agent steps and emits terminal events.
- Add heartbeat protocol.
- Tests: `hook exec` integration with dummy hooks.

### Phase 4 — Reward + evidence producers
- Implement reward step hook I/O contract.
- Implement evidence producer hook invocation + scoring.
- Tests: reward reported event + redo policy.

#### Phase 4.1 — Decide reward responsibility (spec decision)

Implementation supports both modes:

- Reward hook emits `reward_report` (hook-driven).
- Reward hook omits `reward_report`; runner computes it by invoking evidence producers (runner-driven).

The spec should explicitly allow one or both, and define the precedence rule (current behavior: if `reward_report` is present, use it; otherwise compute).

#### Phase 4.2 — Evidence/scoring metric keys (spec decision)

MVP scoring currently assumes:

- `pass_fail`: evidence metrics include `failed` (number)
- `diff_ratio`: evidence metrics include `diff_ratio` (number)

Spec should codify required keys and default behavior when missing.

### Phase 5 — Dependencies + sweep robustness
- Spawn deps from hook output; block parent until deps complete.
- Implement `run sweep` + stale execution recovery policy.
- Tests: stale/timeout fixtures.

#### Phase 5.1 — Normalize the spawn contract (missed in initial plan)

The implementation supports `spawn[]` items shaped like:

- `{ playbook: "path@version" }` or `{ template_ref: "path@version" }`

The guide originally proposed `spawn[].dispatch.template_ref`. The spec/workplan should pick a canonical shape and validate it.

## Open questions / follow-ups
- Do runs also create an Issue entity for UX discoverability, or are runs standalone under `.collab/runs/**`?
- Should run templates be embedded in `run.dispatched`/creation event (for immutability), or always reloaded by ref?
- Cross-platform hook execution (PowerShell vs bash) policy: do we standardize on `node` hooks for portability?
- Should artifacts be tracked by default or gitignored with optional LFS guidance?
