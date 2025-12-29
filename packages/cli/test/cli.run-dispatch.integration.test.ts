import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture, run } from "./_util.js";

describe("CLI run dispatch (orchestration MVP)", () => {
  it("creates a run with initial events and commits", async () => {
    const repo = await makeRepoFromFixture("repo-orchestration-dispatch");
    let out = "";
    const code = await runCli(
      ["run", "dispatch", "--repo", repo, "--playbook", "playbooks/min.yaml@v1", "--run-id", "run_test"],
      { stdout: (s) => (out += s), stderr: () => {} }
    );
    expect(code).toBe(0);
    expect(out.trim()).toBe("run_test");

    const eventsDir = path.join(repo, ".collab", "runs", "run_test", "events");
    const files = await fs.readdir(eventsDir);
    expect(files.some((f) => f.includes("__run.dispatched__s0__a0__"))).toBe(true);
    expect(files.some((f) => f.includes("__run.step.scheduled__s1__a1__"))).toBe(true);

    const status = (await run("git", ["-C", repo, "status", "--porcelain"], repo)).stdout.trim();
    expect(status).toBe("");
  });
});

