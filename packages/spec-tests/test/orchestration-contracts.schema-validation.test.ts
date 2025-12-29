import { describe, expect, it } from "vitest";
import path from "node:path";
import { createAjvForSchemas } from "../src/ajv.js";
import { repoRootFromHere } from "../src/repo.js";

describe("Orchestration contract schemas", () => {
  it("validates example reconcile plan + hook IO", async () => {
    const root = repoRootFromHere(import.meta.dirname);
    const schemaDir = path.join(root, "spec", "schemas");
    const ajv = await createAjvForSchemas(schemaDir);

    const planSchemaId = "https://a5cforge.dev/schemas/a5cforge-v1/run.reconcile.plan.schema.json";
    const stepInputSchemaId = "https://a5cforge.dev/schemas/a5cforge-v1/run.hook.step.input.schema.json";
    const evidenceInSchemaId = "https://a5cforge.dev/schemas/a5cforge-v1/run.hook.evidence.input.schema.json";
    const evidenceOutSchemaId = "https://a5cforge.dev/schemas/a5cforge-v1/run.hook.evidence.output.schema.json";

    const validatePlan = await ajv.getSchema(planSchemaId);
    const validateStepIn = await ajv.getSchema(stepInputSchemaId);
    const validateEIn = await ajv.getSchema(evidenceInSchemaId);
    const validateEOut = await ajv.getSchema(evidenceOutSchemaId);

    expect(validatePlan).toBeTypeOf("function");
    expect(validateStepIn).toBeTypeOf("function");
    expect(validateEIn).toBeTypeOf("function");
    expect(validateEOut).toBeTypeOf("function");

    const stepInput = {
      run_id: "run_001",
      step_id: 1,
      attempt: 1,
      instructions: "noop",
      agent: { profile: "default" },
      state: { run_id: "run_001" },
      template: { template_id: "t", version: "v1" },
      hook_mapping: {
        schema: "a5cforge/v1",
        kind: "hook-mapping",
        version: "v1",
        step_hooks: { agent: "agent/[profile]", reward: "reward" },
        evidence_hooks: { command: "command" }
      }
    };
    expect(validateStepIn!(stepInput)).toBe(true);

    const plan = {
      actor: "runner:cli",
      treeish: "HEAD",
      plans: [
        {
          run_id: "run_001",
          kind: "EXECUTE_STEP",
          step_id: 1,
          attempt: 1,
          step_type: "agent",
          hook: ".a5c/hooks/steps/agent.js",
          hook_input: stepInput,
          events_to_emit_before: [{ kind: "run.step.started", payload: { run_id: "run_001", step_id: 1, attempt: 1 } }],
          events_expected_after: ["run.step.completed", "run.step.failed"]
        },
        { run_id: "run_001", kind: "WAIT_DEPS", reason: "deps", deps: { pending: ["run_dep_1"], completed: [] }, events_to_emit: [] }
      ]
    };

    expect(validatePlan!(plan)).toBe(true);

    const evidenceIn = {
      run_id: "run_001",
      step_id: 2,
      attempt: 1,
      signal_id: "unit",
      producer: "jest",
      producer_args: { cmd: "pnpm test" },
      artifact_root: "artifacts/runs/run_001/step_2/attempt_1"
    };
    expect(validateEIn!(evidenceIn)).toBe(true);

    const evidenceOut = {
      ok: true,
      evidence: [{ evidence_id: "unit_report", kind: "report", paths: ["x.xml"], metrics: { failed: 0 } }]
    };
    expect(validateEOut!(evidenceOut)).toBe(true);
  });
});
