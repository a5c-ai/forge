import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI run playbook", () => {
  it(
    "runs repo-min playbook end-to-end (agent + parse + reward)",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // The agent hook in this fixture runs the CLI as a subprocess.
      // Point it at the built JS entrypoint.
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
              "run_900",
              "--max-iterations",
              "20",
              "--json"
            ],
            {
              stdout: (s) => (out += s),
              stderr: () => {}
            }
          )
        ).toBe(0);

        const obj = JSON.parse(out);
        expect(obj.run_id).toBe("run_900");
        expect(obj.status).toBe("DONE");

        const codexEvents = path.join(repo, "artifacts", "runs", "run_900", "step_1", "attempt_1", "codex-events.jsonl");
        const raw = await fs.readFile(codexEvents, "utf8");
        expect(raw.length).toBeGreaterThan(0);
        expect(raw).toContain('"type":"tokens_used"');
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }
    },
    60000
  );
});
