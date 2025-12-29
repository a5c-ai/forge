import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI orchestration end-to-end (sweep → resume → tick)", () => {
  it(
    "sweeps a stale execution into WAIT_HUMAN, then resumes and completes",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-sweep-stale");

      const prevNow = process.env.A5C_NOW_ISO;
      const prevIdle = process.env.A5C_STEP_IDLE_SECONDS;
      process.env.A5C_NOW_ISO = "2025-12-26T00:10:00.000Z";
      process.env.A5C_STEP_IDLE_SECONDS = "60";
      try {
        expect(await runCli(["run", "sweep", "--repo", repo, "--max", "10"], { stdout: () => {}, stderr: () => {} })).toBe(0);

        const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
        let names = (await fs.readdir(eventsDir)).sort();
        expect(names.some((n) => n.includes("__run.step.exec.timed_out__s1__a1__"))).toBe(true);
        expect(names.some((n) => n.includes("__run.human.waiting__s1__a1__"))).toBe(true);

        expect(
          await runCli(["run", "resume", "--repo", repo, "--run-id", "run_001", "-m", "resume after timeout"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);

        // After resuming, the planner should allow executing the step.
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_001", "--max-transitions", "3"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);

        names = (await fs.readdir(eventsDir)).sort();
        expect(names.some((n) => n.includes("__run.human.resumed__s1__a1__"))).toBe(true);
        expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);
      } finally {
        if (prevNow === undefined) delete process.env.A5C_NOW_ISO;
        else process.env.A5C_NOW_ISO = prevNow;
        if (prevIdle === undefined) delete process.env.A5C_STEP_IDLE_SECONDS;
        else process.env.A5C_STEP_IDLE_SECONDS = prevIdle;
      }
    },
    60000
  );
});

