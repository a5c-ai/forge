import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture, run } from "./_util.js";

describe("CLI hook exec --dry-run", () => {
  it(
    "does not write events or modify git status",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      let out = "";
      const reconcileCode = await runCli(["run", "reconcile", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: () => {} });
      expect(reconcileCode).toBe(0);
      const plan = JSON.parse(out);

      const planPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-plan-")), "plan.json");
      await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const before = (await fs.readdir(eventsDir)).length;

      const execCode = await runCli(["hook", "exec", "--repo", repo, "--plan", planPath, "--dry-run"], {
        stdout: () => {},
        stderr: () => {}
      });
      expect(execCode).toBe(0);

      const after = (await fs.readdir(eventsDir)).length;
      expect(after).toBe(before);

      const status = (await run("git", ["-C", repo, "status", "--porcelain"], repo)).stdout.trim();
      expect(status).toBe("");
    },
    20000
  );
});

