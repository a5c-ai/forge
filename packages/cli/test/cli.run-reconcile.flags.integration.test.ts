import { describe, expect, it } from "vitest";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run reconcile flags", () => {
  it("supports --run-id filtering", async () => {
    const repo = await makeRepoFromFixture("repo-orchestration-min");
    let out = "";
    const code = await runCli(["run", "reconcile", "--repo", repo, "--json", "--run-id", "run_001"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    const obj = JSON.parse(out);
    expect(obj.plans.length).toBeGreaterThan(0);
    expect(obj.plans.every((p: any) => p.run_id === "run_001")).toBe(true);
  });

  it("supports --max-transitions", async () => {
    const repo = await makeRepoFromFixture("repo-orchestration-min");
    let out = "";
    const code = await runCli(["run", "reconcile", "--repo", repo, "--json", "--max-transitions", "0"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    const obj = JSON.parse(out);
    expect(obj.plans).toEqual([]);
  });
});

