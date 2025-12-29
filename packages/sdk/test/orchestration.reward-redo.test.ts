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

describe("orchestration reward auto-redo", () => {
  it("rewinds to redo target step with incremented attempt", () => {
    const template: Template = {
      template_id: "t",
      version: "v1",
      steps: [
        { step_id: 1, type: "agent" },
        {
          step_id: 2,
          type: "reward",
          reward: { signals: ["unit"], policy: { on_fail: "auto_redo", redo_target_step_id: 1 }, thresholds: { pass: 0.8 } }
        }
      ]
    };

    const events: ParsedEventFile[] = [
      ev("run.step.started", { run_id: "run_001", step_id: 1, attempt: 1 }),
      ev("run.step.completed", { run_id: "run_001", step_id: 1, attempt: 1 }),
      ev("run.reward.reported", { run_id: "run_001", step_id: 2, attempt: 1, data: { reward_total: 0.5 } })
    ];

    const state = deriveRunState({ runId: "run_001", template, events });
    expect(state.recovery?.kind).toBe("redo");
    expect(state.current.step_id).toBe(1);
    expect(state.current.attempt).toBe(2);

    const plan = planNextTransition({ state, template, resolveStepHook: () => "hook" });
    expect(plan?.kind).toBe("EXECUTE_STEP");
    if (plan?.kind === "EXECUTE_STEP") {
      expect(plan.step_id).toBe(1);
      expect(plan.attempt).toBe(2);
      expect(plan.events_to_emit_before.some((e) => e.kind === "run.step.redo_requested")).toBe(true);
    }
  });
});
