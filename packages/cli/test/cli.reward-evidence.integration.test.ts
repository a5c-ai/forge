import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI reward evidence producers + scoring (orchestration MVP)", () => {
  it(
    "computes reward_total when reward hook omits reward_report",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-evidence-scoring");

      expect(
        await runCli(["run", "dispatch", "--repo", repo, "--playbook", "playbooks/min.yaml@v1", "--run-id", "run_001"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      const prev = process.env.A5C_TEST_DIFF_RATIO;
      process.env.A5C_TEST_DIFF_RATIO = "0.5";
      try {
        // step 1
        expect(await runCli(["run", "tick", "--repo", repo, "--run-id", "run_001"], { stdout: () => {}, stderr: () => {} })).toBe(0);
        // reward step 2 (evidence + scoring)
        expect(await runCli(["run", "tick", "--repo", repo, "--run-id", "run_001"], { stdout: () => {}, stderr: () => {} })).toBe(0);
      } finally {
        if (prev === undefined) delete process.env.A5C_TEST_DIFF_RATIO;
        else process.env.A5C_TEST_DIFF_RATIO = prev;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      const rewardPath = names.find((n) => n.includes("__run.reward.reported__s2__a1__"));
      expect(rewardPath).toBeTruthy();
      const ev = JSON.parse(await fs.readFile(path.join(eventsDir, rewardPath!), "utf8"));
      expect(typeof ev?.payload?.reward_total).toBe("number");
      expect(ev.payload.reward_total).toBeGreaterThan(0.7);
      expect(ev.payload.reward_total).toBeLessThan(0.8);
      expect(ev.payload.data?.signals?.unit?.score).toBe(1);
    },
    30000
  );
});

