import { describe, expect, it } from "vitest";
import type { ParsedEventFile } from "../src/collab/eventTypes.js";
import { deriveRunState } from "../src/orchestration/derive.js";
import { planNextTransition } from "../src/orchestration/plan.js";
import type { Template } from "../src/orchestration/types.js";

function ev(kind: string, payload: Record<string, unknown>): ParsedEventFile {
  return {
    path: "x",
    kind,
    event: { schema: "a5cforge/v1", kind, id: "e", time: "2025-12-26T00:00:00.000Z", actor: "tester", payload }
  };
}

describe("orchestration dependencies (MVP)", () => {
  it("plans WAIT_DEPS when any dep is pending", () => {
    const template: Template = {
      template_id: "t",
      version: "v1",
      steps: [
        { step_id: 1, type: "agent" },
        { step_id: 2, type: "agent" }
      ]
    };

    const events: ParsedEventFile[] = [
      ev("run.step.completed", { run_id: "run_001", step_id: 1, attempt: 1 }),
      ev("run.dep.spawned", { run_id: "run_001", dep_run_id: "run_dep_1" })
    ];

    const state = deriveRunState({ runId: "run_001", template, events });
    expect(state.status).toBe("WAIT_DEPS");
    expect(state.deps.pending).toEqual(["run_dep_1"]);

    const plan = planNextTransition({ state, template, resolveStepHook: () => "hook" });
    expect(plan?.kind).toBe("WAIT_DEPS");
    if (plan?.kind === "WAIT_DEPS") {
      expect(plan.deps.pending).toEqual(["run_dep_1"]);
    }
  });

  it("unblocks after run.dep.completed", () => {
    const template: Template = {
      template_id: "t",
      version: "v1",
      steps: [
        { step_id: 1, type: "agent" },
        { step_id: 2, type: "agent" }
      ]
    };

    const events: ParsedEventFile[] = [
      ev("run.step.completed", { run_id: "run_001", step_id: 1, attempt: 1 }),
      ev("run.dep.spawned", { run_id: "run_001", dep_run_id: "run_dep_1" }),
      ev("run.dep.completed", { run_id: "run_001", dep_run_id: "run_dep_1" })
    ];

    const state = deriveRunState({ runId: "run_001", template, events });
    expect(state.status).toBe("ACTIVE");
    expect(state.deps.pending).toEqual([]);
    expect(state.deps.completed).toEqual(["run_dep_1"]);

    const plan = planNextTransition({ state, template, resolveStepHook: () => "hook" });
    expect(plan?.kind).toBe("EXECUTE_STEP");
    if (plan?.kind === "EXECUTE_STEP") {
      expect(plan.step_id).toBe(2);
    }
  });
});
