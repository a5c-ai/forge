# a5cforge next steps (tracked checklist)

This document turns the current gap analysis into **PR-sized tasks**.

Principles:

- Each task should be mergeable independently.
- Prefer adding/adjusting tests alongside behavior changes.
- Avoid mixing spec changes + implementation refactors in the same PR unless required.

## 0) Navigation / “start here”

- [ ] **PR: Add `docs/README.md` “start here”**
  - **Goal:** One entry point for new users.
  - **Acceptance:** `docs/README.md` links to:
    - `docs/cli/reference.md`
    - `docs/orchestration/README.md`
    - `docs/orchestration/end-to-end.md`
    - `docs/orchestration/recipes.md`
    - `docs/cli/agent-generate-context.md`
    - `docs/cli/parse.md`
    - `docs/protocol/*` (if user-facing)
  - **Notes:** Include a short “running locally” section and Windows note about `git-a5c` vs `git a5c`.

## 1) Specs / contracts

- [ ] **PR: Add JSON schema for `parse --type codex` JSONL events**
  - **Goal:** Make parse output contractual.
  - **Targets:** `spec/schemas/` (new schema), optionally a small validator helper.
  - **Acceptance:** Tests validate at least a few emitted parse events against the schema.

- [ ] **PR: Clarify event taxonomy for ops events**
  - **Goal:** Canonicalize `ops.event.created` with `payload.op=build|test|deploy` in docs/spec.
  - **Targets:** docs + `spec/schemas/*` if relevant.
  - **Acceptance:** Docs stop referring to `ops.deploy.created`-style kinds.

- [ ] **PR: Consolidate “event filename grammar + ordering invariants” into one doc**
  - **Goal:** One place that defines naming/order assumptions (what breaks if violated).
  - **Targets:** `docs/protocol/` or `docs/orchestration/protocol.md`.
  - **Acceptance:** Docs clearly describe monotonic filenames, run-id scoping, and actor fields.

## 2) Implementation hardening

- [ ] **PR: `hook exec` accept raw array plans**
  - **Goal:** Allow `--plan` to be either `{ plans: [...] }` or `[...]`.
  - **Targets:** `packages/cli/src/commands/hookExec.ts`.
  - **Acceptance:** E2E test that writes the raw array format passes.

- [ ] **PR: Deterministic ordering for github/git globs**
  - **Goal:** Make glob output stable across platforms and API order.
  - **Targets:** `packages/cli/src/commands/agentGenerateContext.ts`.
  - **Acceptance:** Tests assert stable ordering for multi-file `github://` (token-gated) and `git://` globs.

- [ ] **PR: Optional “restricted templating” mode**
  - **Goal:** Provide a safer mode for `agent generate-context` (avoid arbitrary JS execution).
  - **Options:**
    - environment flag (e.g. `A5C_TEMPLATE_SAFE_MODE=1`) limiting allowed expression syntax
    - allowlist of helper functions + property access only
  - **Acceptance:** Document the mode; add tests that unsafe constructs fail closed.

## 3) Tests (coverage shape)

- [ ] **PR: Parse schema + golden tests**
  - **Goal:** Prevent accidental parse output drift.
  - **Acceptance:** A fixture log produces stable JSONL fields and validates against schema.

- [ ] **PR: Add github:// protocol-relative include test (token-gated)**
  - **Goal:** Ensure `//...` includes behave as documented when base is `github://...`.
  - **Acceptance:** Token-gated test passes; behavior documented.

- [ ] **PR: Add “small real workflow” test that references docs**
  - **Goal:** Ensure `docs/orchestration/recipes.md` stays runnable.
  - **Acceptance:** One E2E test uses the exact commands (or close equivalents) from a recipe.

## 4) Docs polish / consistency

- [ ] **PR: Add “concepts” page**
  - **Goal:** Reduce confusion about snapshot/treeish vs working tree, `.collab` vs playbooks, plan envelope vs entries.
  - **Targets:** `docs/orchestration/`.
  - **Acceptance:** `docs/orchestration/README.md` links it.

- [ ] **PR: Standardize docs wording on CLI invocation**
  - **Goal:** Everywhere: `git-a5c` (binary) vs `git a5c` (git subcommand) explained once; hooks guidance consistent.
  - **Acceptance:** Quickstart snippets remain correct, especially on Windows.

