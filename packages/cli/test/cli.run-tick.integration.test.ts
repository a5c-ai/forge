import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run tick (orchestration MVP)", () => {
  it(
    "executes one step then emits WAIT_HUMAN on next tick",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      const prevHb = process.env.A5C_HEARTBEAT_MS;
      const prevSleep = process.env.A5C_TEST_SLEEP_MS;
      process.env.A5C_HEARTBEAT_MS = "0";
      process.env.A5C_TEST_SLEEP_MS = "0";
      try {
        expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
        expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
      } finally {
        if (prevHb === undefined) delete process.env.A5C_HEARTBEAT_MS;
        else process.env.A5C_HEARTBEAT_MS = prevHb;
        if (prevSleep === undefined) delete process.env.A5C_TEST_SLEEP_MS;
        else process.env.A5C_TEST_SLEEP_MS = prevSleep;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.human.waiting__s2__a1__"))).toBe(true);
    },
    30000
  );
});

