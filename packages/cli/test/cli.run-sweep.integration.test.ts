import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run sweep (orchestration MVP)", () => {
  it(
    "emits timed_out + waiting for stale executions",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-sweep-stale");
      const prevNow = process.env.A5C_NOW_ISO;
      const prevIdle = process.env.A5C_STEP_IDLE_SECONDS;
      process.env.A5C_NOW_ISO = "2025-12-26T00:10:00.000Z";
      process.env.A5C_STEP_IDLE_SECONDS = "60";
      try {
        const code = await runCli(["run", "sweep", "--repo", repo, "--max", "10"], { stdout: () => {}, stderr: () => {} });
        expect(code).toBe(0);
      } finally {
        if (prevNow === undefined) delete process.env.A5C_NOW_ISO;
        else process.env.A5C_NOW_ISO = prevNow;
        if (prevIdle === undefined) delete process.env.A5C_STEP_IDLE_SECONDS;
        else process.env.A5C_STEP_IDLE_SECONDS = prevIdle;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.exec.timed_out__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.human.waiting__s1__a1__"))).toBe(true);
    },
    20000
  );
});

