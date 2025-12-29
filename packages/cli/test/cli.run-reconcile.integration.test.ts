import { describe, expect, it } from "vitest";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run reconcile (orchestration MVP)", () => {
  it("emits a JSON plan for a run fixture", async () => {
    const repo = await makeRepoFromFixture("repo-orchestration-min");
    let out = "";
    let err = "";
    const code = await runCli(["run", "reconcile", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: (s) => (err += s) });
    expect(code).toBe(0);
    expect(err).toBe("");
    const obj = JSON.parse(out);
    expect(obj.plans.length).toBeGreaterThan(0);
    expect(obj.plans[0].run_id).toBe("run_001");
    expect(obj.plans[0].kind).toBe("EXECUTE_STEP");
    expect(obj.plans[0].step_id).toBe(1);
  });
});

