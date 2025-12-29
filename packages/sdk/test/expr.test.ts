import { describe, expect, it } from "vitest";
import { evalExprBoolean } from "../src/orchestration/expr.js";

describe("expr", () => {
  it("evaluates boolean comparisons against state", () => {
    const ok = evalExprBoolean("state.reward.latest.reward_total >= 0.85", {
      state: { reward: { latest: { reward_total: 0.92 } } }
    });
    expect(ok).toBe(true);
  });

  it("supports &&, ||, and parentheses", () => {
    const ok = evalExprBoolean("(state.x == 1 && state.y == 2) || state.z == 3", {
      state: { x: 1, y: 2, z: 0 }
    });
    expect(ok).toBe(true);
  });

  it("treats missing paths as undefined", () => {
    const ok = evalExprBoolean("state.nope == null", { state: {} });
    expect(ok).toBe(false);
  });
});

