import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run playbook profile override", () => {
  it(
    "forces agent hook profile via --agent-profile",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // The agent hook in this fixture runs the CLI as a subprocess.
      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const oldA5cCli = process.env.A5C_CLI;
      process.env.A5C_CLI = cliEntrypoint;
      try {
        let out = "";
        expect(
          await runCli(
            [
              "run",
              "playbook",
              "--repo",
              repo,
              "--playbook",
              "playbooks/web_feature.yaml@v1",
              "--run-id",
              "run_910",
              "--agent-profile",
              "alt",
              "--max-iterations",
              "20",
              "--json"
            ],
            { stdout: (s) => (out += s), stderr: () => {} }
          )
        ).toBe(0);

        const result = JSON.parse(out);
        expect(result.status).toBe("DONE");

        // Validate the hook used the alternate profile.
        const hookInput = path.join(repo, "artifacts", "runs", "run_910", "step_1", "attempt_1", "hook-input.json");
        const parsed = JSON.parse(await fs.readFile(hookInput, "utf8"));
        expect(parsed.agent.profile).toBe("alt");
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }
    },
    60000
  );
});

