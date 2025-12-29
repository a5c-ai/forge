import { describe, expect, it } from "vitest";
import path from "node:path";
import { createAjvForSchemas } from "../src/ajv.js";
import { repoRootFromHere } from "../src/repo.js";

describe("Reward report (scorecard) schema", () => {
  it("validates example reward report", async () => {
    const root = repoRootFromHere(import.meta.dirname);
    const schemaDir = path.join(root, "spec", "schemas");
    const ajv = await createAjvForSchemas(schemaDir);

    const schemaId = "https://a5cforge.dev/schemas/a5cforge-v1/reward.report.schema.json";
    const validate = await ajv.getSchema(schemaId);
    expect(validate, `missing schema in AJV: ${schemaId}`).toBeTypeOf("function");

    const example = {
      reward_total: 0.9,
      pass_threshold: 0.8,
      decision: "pass",
      signals: {
        unit: { pass_fail: true, score: 1, severity: "HARD", evidence: [], summary: "ok" }
      },
      notes: "looks good"
    };

    const ok = validate!(example);
    if (!ok) throw new Error(JSON.stringify(validate!.errors, null, 2));
  });
});

