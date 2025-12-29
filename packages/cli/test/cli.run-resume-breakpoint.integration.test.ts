import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run resume (breakpoint override)", () => {
  it(
    "allows continuing past breakpointed agent step",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-breakpoint-resume");

      // tick emits WAIT_HUMAN, does not execute step.
      expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      let names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.human.waiting__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(false);

      // resume overrides breakpoint
      expect(
        await runCli(["run", "resume", "--repo", repo, "--run-id", "run_001", "-m", "go"], { stdout: () => {}, stderr: () => {} })
      ).toBe(0);
      expect(await runCli(["run", "tick", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);

      names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.human.resumed__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);

      const resumedFile = names.find((n) => n.includes("__run.human.resumed__s1__a1__"))!;
      const resumed = JSON.parse(await fs.readFile(path.join(eventsDir, resumedFile), "utf8"));
      expect(resumed.payload.message).toBe("go");
    },
    30000
  );
});
