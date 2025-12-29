import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI hook exec hook I/O validation", () => {
  it(
    "fails when hook output is schema-invalid (A5C_VALIDATE_HOOK_IO=1)",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-min");

      // Break the agent hook output (schema requires { ok: boolean, ... }).
      const hookPath = path.join(repo, ".a5c", "hooks", "steps", "agent", "default.js");
      await fs.writeFile(hookPath, "#!/usr/bin/env node\nprocess.stdout.write('{}\\n');\n", "utf8");

      let out = "";
      const reconcileCode = await runCli(["run", "reconcile", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: () => {} });
      expect(reconcileCode).toBe(0);
      const plan = JSON.parse(out);

      const planPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-plan-")), "plan.json");
      await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

      const prevValidate = process.env.A5C_VALIDATE_HOOK_IO;
      const prevHb = process.env.A5C_HEARTBEAT_MS;
      process.env.A5C_VALIDATE_HOOK_IO = "1";
      process.env.A5C_HEARTBEAT_MS = "0";
      try {
        const execCode = await runCli(["hook", "exec", "--repo", repo, "--plan", planPath], { stdout: () => {}, stderr: () => {} });
        expect(execCode).toBe(1);
      } finally {
        if (prevValidate === undefined) delete process.env.A5C_VALIDATE_HOOK_IO;
        else process.env.A5C_VALIDATE_HOOK_IO = prevValidate;
        if (prevHb === undefined) delete process.env.A5C_HEARTBEAT_MS;
        else process.env.A5C_HEARTBEAT_MS = prevHb;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("__run.step.exec.started__s1__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.completed__s1__a1__"))).toBe(false);
      expect(names.some((n) => n.includes("__run.step.failed__s1__a1__"))).toBe(false);
    },
    20000
  );
});
