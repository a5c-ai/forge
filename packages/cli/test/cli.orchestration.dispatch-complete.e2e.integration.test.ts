import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI orchestration end-to-end (dispatch → tick → complete-step)", () => {
  it(
    "dispatches a fresh run, pauses on human step, then completes and finishes",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      expect(
        await runCli(
          [
            "run",
            "dispatch",
            "--repo",
            repo,
            "--playbook",
            "playbooks/web_feature.yaml@v1",
            "--run-id",
            "run_002"
          ],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      // Execute step 1 then pause on step 2 (human).
      expect(
        await runCli(
          ["run", "tick", "--repo", repo, "--run-id", "run_002", "--max-transitions", "10"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      const eventsDir = path.join(repo, ".collab", "runs", "run_002", "events");
      let names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.human.waiting__s2__a1__"))).toBe(true);

      // Complete the human step.
      expect(
        await runCli(
          ["run", "complete-step", "--repo", repo, "--run-id", "run_002", "-m", "ok"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      // Execute remaining steps (agent + reward).
      expect(
        await runCli(
          ["run", "tick", "--repo", repo, "--run-id", "run_002", "--max-transitions", "10"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.completed__s3__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.reward.reported__s4__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.failed__"))).toBe(false);
    },
    60000
  );
});

