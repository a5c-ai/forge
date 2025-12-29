import { describe, expect, it } from "vitest";
import type { ParsedEventFile } from "../src/collab/eventTypes.js";
import { deriveRunState } from "../src/orchestration/derive.js";
import { planNextTransition } from "../src/orchestration/plan.js";
import type { Template } from "../src/orchestration/types.js";

const baseTemplate: Template = {
  template_id: "t",
  version: "v1",
  steps: [
    { step_id: 1, type: "agent", breakpoint: { enabled: false } },
    { step_id: 2, type: "reward", breakpoint: { enabled: false } }
  ],
  cbp: [
    {
      id: "pause_on_high_reward",
      scope: "step",
      step_id: 2,
      when: "state.reward.latest.reward_total >= 0.85",
      message: "pause"
    }
  ]
};

function ev(kind: string, payload: Record<string, unknown>): ParsedEventFile {
  return {
    path: "x",
    kind,
    event: { schema: "a5cforge/v1", kind, id: "e", time: "2025-12-26T00:00:00.000Z", actor: "tester", payload }
  };
}

describe("orchestration derive + plan (MVP)", () => {
  it("plans EXECUTE_STEP for first agent step", () => {
    const state = deriveRunState({ runId: "run_001", template: baseTemplate, events: [ev("run.step.scheduled", { run_id: "run_001", step_id: 1, attempt: 1 })] });
    const plan = planNextTransition({ state, template: baseTemplate, resolveStepHook: () => "hook" });
    expect(plan?.kind).toBe("EXECUTE_STEP");
    if (plan?.kind === "EXECUTE_STEP") {
      expect(plan.step_id).toBe(1);
    }
  });

  it("CBP rides on breakpoint and forces WAIT_HUMAN", () => {
    const events: ParsedEventFile[] = [
      ev("run.step.started", { run_id: "run_001", step_id: 1, attempt: 1 }),
      ev("run.step.completed", { run_id: "run_001", step_id: 1, attempt: 1 }),
      ev("run.reward.reported", { run_id: "run_001", step_id: 2, attempt: 1, data: { reward_total: 0.92 } })
    ];
    const state = deriveRunState({ runId: "run_001", template: baseTemplate, events });
    // All steps are terminal (reward reported), but we want the CBP to be available
    // for the next transition decision (e.g., before finishing). The MVP planner
    // pauses before executing steps, so simulate reward step as current.
    state.status = "ACTIVE";
    state.current = { step_id: 2, attempt: 1, phase: "IDLE" };
    const plan = planNextTransition({ state, template: baseTemplate, resolveStepHook: () => "hook" });
    expect(plan?.kind).toBe("WAIT_HUMAN");
  });
});
