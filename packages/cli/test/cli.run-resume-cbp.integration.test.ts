import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run resume (CBP override)", () => {
  it(
    "allows continuing past CBP-triggered pause",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-cbp-resume");

      // tick emits WAIT_HUMAN due to CBP.
      expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      let names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.human.waiting__s1__a1__"))).toBe(true);

      expect(await runCli(["run", "resume", "--repo", repo, "--run-id", "run_001"], { stdout: () => {}, stderr: () => {} })).toBe(0);
      expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);

      names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);
    },
    30000
  );
});

