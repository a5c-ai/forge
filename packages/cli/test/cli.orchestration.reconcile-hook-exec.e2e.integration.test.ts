import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI orchestration end-to-end (dispatch → reconcile → hook exec)", () => {
  it(
    "runs a full playbook by alternating reconcile and hook exec",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // The agent hook in this fixture runs the CLI as a subprocess.
      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const oldA5cCli = process.env.A5C_CLI;
      process.env.A5C_CLI = cliEntrypoint;
      try {
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
              "run_003"
            ],
            { stdout: () => {}, stderr: () => {} }
          )
        ).toBe(0);

        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-e2e-plan-"));

        // Loop: reconcile -> execute any EXECUTE_STEP transitions.
        for (let i = 0; i < 5; i++) {
          let out = "";
          expect(
            await runCli(["run", "reconcile", "--repo", repo, "--run-id", "run_003", "--json"], {
              stdout: (s) => (out += s),
              stderr: () => {}
            })
          ).toBe(0);
          const envelope = JSON.parse(out);
          const execOnly = (envelope.plans ?? []).filter((p: any) => p.kind === "EXECUTE_STEP");
          if (execOnly.length === 0) break;

          const planPath = path.join(tmpDir, `plan_${i}.json`);
          // hook exec should accept either an envelope or a raw array.
          await fs.writeFile(planPath, JSON.stringify(execOnly, null, 2), "utf8");

          expect(
            await runCli(["hook", "exec", "--repo", repo, "--plan", planPath], { stdout: () => {}, stderr: () => {} })
          ).toBe(0);
        }
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_003", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      expect(names.some((n) => n.includes("run.step.failed"))).toBe(false);
      expect(names.some((n) => n.includes("run.step.completed"))).toBe(true);
      expect(names.some((n) => n.includes("run.reward.reported"))).toBe(true);
    },
    60000
  );
});
