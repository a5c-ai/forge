import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run tick --max-transitions", () => {
  it(
    "can execute step then emit next waiting in one invocation",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");
      const code = await runCli(["run", "tick", "--repo", repo, "--max-transitions", "2"], { stdout: () => {}, stderr: () => {} });
      expect(code).toBe(0);

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.human.waiting__s2__a1__"))).toBe(true);
    },
    30000
  );
});

