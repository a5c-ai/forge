import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI reward auto-redo (orchestration MVP)", () => {
  it(
    "reward failure triggers redo of step 1 with attempt increment",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-reward-redo");

      const prev = process.env.A5C_TEST_REWARD_TOTAL;
      process.env.A5C_TEST_REWARD_TOTAL = "0.5";
      try {
        // tick #1: execute step 1 attempt 1
        expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
        // tick #2: execute reward step 2 attempt 1, report fail
        expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
        // tick #3: planner should redo step 1 attempt 2
        expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
      } finally {
        if (prev === undefined) delete process.env.A5C_TEST_REWARD_TOTAL;
        else process.env.A5C_TEST_REWARD_TOTAL = prev;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.reward.reported__s2__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.redo_requested__s1__a2__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.completed__s1__a2__"))).toBe(true);
    },
    30000
  );
});

