import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI hook exec (orchestration MVP)", () => {
  it(
    "executes an agent hook and appends started/completed (and heartbeats)",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      let out = "";
      const reconcileCode = await runCli(["run", "reconcile", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: () => {} });
      expect(reconcileCode).toBe(0);
      const plan = JSON.parse(out);

      const planPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-plan-")), "plan.json");
      await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

      const prevHb = process.env.A5C_HEARTBEAT_MS;
      const prevSleep = process.env.A5C_TEST_SLEEP_MS;
      const prevValidate = process.env.A5C_VALIDATE_HOOK_IO;
      process.env.A5C_HEARTBEAT_MS = "30";
      process.env.A5C_TEST_SLEEP_MS = "120";
      process.env.A5C_VALIDATE_HOOK_IO = "1";
      try {
        let err = "";
        const execCode = await runCli(["hook", "exec", "--repo", repo, "--plan", planPath], { stdout: () => {}, stderr: (s) => (err += s) });
        expect(err).toBe("");
        expect(execCode).toBe(0);
      } finally {
        if (prevHb === undefined) delete process.env.A5C_HEARTBEAT_MS;
        else process.env.A5C_HEARTBEAT_MS = prevHb;
        if (prevSleep === undefined) delete process.env.A5C_TEST_SLEEP_MS;
        else process.env.A5C_TEST_SLEEP_MS = prevSleep;
        if (prevValidate === undefined) delete process.env.A5C_VALIDATE_HOOK_IO;
        else process.env.A5C_VALIDATE_HOOK_IO = prevValidate;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.started__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.exec.started__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.heartbeat__s1__a1__"))).toBe(true);
    },
    20000
  );
});
