import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI orchestration end-to-end (repo-min)", () => {
  it(
    "dispatches then ticks through agent+reward (hook calls generate-context + run)",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // The agent hook in this fixture runs the CLI as a subprocess.
      // Point it at the built JS entrypoint.
      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const oldA5cCli = process.env.A5C_CLI;
      process.env.A5C_CLI = cliEntrypoint;
      try {
        let stdout = "";
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
              "run_001"
            ],
            { stdout: (s) => (stdout += s), stderr: () => {} }
          )
        ).toBe(0);
        expect(stdout).toContain("run_001");

        expect(
          await runCli(
            ["run", "tick", "--repo", repo, "--run-id", "run_001", "--max-transitions", "10"],
            { stdout: () => {}, stderr: () => {} }
          )
        ).toBe(0);
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_001", "events");
      const eventNames = (await fs.readdir(eventsDir)).sort();
      expect(eventNames.some((n) => n.includes("run.step.failed"))).toBe(false);
      expect(eventNames.some((n) => n.includes("run.step.completed"))).toBe(true);
      expect(eventNames.some((n) => n.includes("run.reward.reported"))).toBe(true);

      // The agent hook should have created local artifacts.
      const promptPath = path.join(repo, "artifacts", "runs", "run_001", "step_1", "attempt_1", "prompt.md");
      const agentOutPath = path.join(repo, "artifacts", "runs", "run_001", "step_1", "attempt_1", "agent-output.md");
      const prompt = await fs.readFile(promptPath, "utf8");
      const agentOut = await fs.readFile(agentOutPath, "utf8");
      expect(prompt).toContain("A5C prompt");
      expect(agentOut).toContain("fixture echo agent");
    },
    60000
  );
});
