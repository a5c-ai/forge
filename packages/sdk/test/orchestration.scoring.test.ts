import { describe, expect, it } from "vitest";
import { computeRewardReportFromEvidence } from "../src/orchestration/scoring.js";
import type { Template } from "../src/orchestration/types.js";

describe("orchestration reward scoring (pure)", () => {
  it("computes weighted reward_total from evidence", () => {
    const template: Template = {
      template_id: "t",
      version: "v1",
      steps: [
        {
          step_id: 1,
          type: "reward",
          reward: { signals: ["unit", "visual"], policy: { on_fail: "pause" }, thresholds: { pass: 0.8 } }
        }
      ],
      signals: {
        unit: { severity: "HARD", weight: 0.5, producer: "jest", scoring: { mode: "pass_fail" } },
        visual: { severity: "SOFT", weight: 0.5, producer: "pw", scoring: { mode: "diff_ratio", pass_if_lte: 0.02 } }
      }
    };

    const report = computeRewardReportFromEvidence({
      template,
      step: template.steps[0]!,
      evidenceBySignal: {
        unit: [{ evidence_id: "unit", kind: "report", metrics: { failed: 0 } }],
        visual: [{ evidence_id: "visual", kind: "diff", metrics: { diff_ratio: 0.5 } }]
      }
    });

    // unit = 1, visual = ~0.51 => ~0.755
    expect(report.reward_total).toBeGreaterThan(0.7);
    expect(report.reward_total).toBeLessThan(0.8);
    expect(report.decision).toBe("escalate_bp");
    expect(report.signals.unit.pass_fail).toBe(true);
    expect(report.signals.visual.pass_fail).toBe(false);
  });
});
