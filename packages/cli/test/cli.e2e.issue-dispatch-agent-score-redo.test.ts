import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI end-to-end (issue → dispatch → agent → score fail → redo → score pass)", () => {
  it(
    "redos the agent step after reward failure and passes on retry",
    async () => {
      const repo = await makeRepoFromFixture("repo-e2e-issue-agent-score");

      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const prevNow = process.env.A5C_NOW_ISO;
      const prevA5cCli = process.env.A5C_CLI;
      const prevIssue = process.env.A5C_TEST_ISSUE_ID;
      const prevRatio = process.env.A5C_TEST_DIFF_RATIO;

      process.env.A5C_NOW_ISO = "2025-12-01T00:00:00.000Z";
      process.env.A5C_CLI = cliEntrypoint;
      process.env.A5C_TEST_ISSUE_ID = "issue_100";

      try {
        // 1) Create issue
        let out = "";
        expect(
          await runCli(
            ["issue", "new", "--repo", repo, "--id", "issue_100", "--title", "E2E", "--body", "Do thing", "--commit"],
            { stdout: (s) => (out += s), stderr: () => {} }
          )
        ).toBe(0);
        expect(out.trim()).toBe("issue_100");

        // 2) Dispatch redo playbook
        expect(
          await runCli(
            [
              "run",
              "dispatch",
              "--repo",
              repo,
              "--playbook",
              "playbooks/issue_agent_score_redo.yaml@v1",
              "--run-id",
              "run_051"
            ],
            { stdout: () => {}, stderr: () => {} }
          )
        ).toBe(0);

        // 3) Tick agent step attempt 1
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_051", "--max-transitions", "1"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);

        // 4) Tick reward attempt 1 with failing evidence
        process.env.A5C_TEST_DIFF_RATIO = "0.5";
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_051", "--max-transitions", "1"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);

        // 5) Tick redo agent attempt 2 (planned because reward failed)
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_051", "--max-transitions", "1"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);

        // 6) Tick final reward (step 3) with passing evidence
        process.env.A5C_TEST_DIFF_RATIO = "0.01";
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_051", "--max-transitions", "1"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);
      } finally {
        if (prevNow === undefined) delete process.env.A5C_NOW_ISO;
        else process.env.A5C_NOW_ISO = prevNow;
        if (prevA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = prevA5cCli;
        if (prevIssue === undefined) delete process.env.A5C_TEST_ISSUE_ID;
        else process.env.A5C_TEST_ISSUE_ID = prevIssue;
        if (prevRatio === undefined) delete process.env.A5C_TEST_DIFF_RATIO;
        else process.env.A5C_TEST_DIFF_RATIO = prevRatio;
      }

      const eventsDir = path.join(repo, ".collab", "runs", "run_051", "events");
      const names = (await fs.readdir(eventsDir)).sort();

      expect(names.some((n) => n.includes("__run.reward.reported__s2__a1__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.redo_requested__s1__a2__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.step.completed__s1__a2__"))).toBe(true);
      expect(names.some((n) => n.includes("__run.reward.reported__s3__a1__"))).toBe(true);

      const rewardFile = names.find((n) => n.includes("__run.reward.reported__s3__a1__"))!;
      const reward = JSON.parse(await fs.readFile(path.join(eventsDir, rewardFile), "utf8"));
      expect(reward.payload.reward_total).toBe(1);

      // Prompt was generated at least once.
      const promptPath = path.join(repo, ".a5c", "tmp", "run_051", "step_1", "attempt_2", "prompt.md");
      const prompt = await fs.readFile(promptPath, "utf8");
      expect(prompt).toContain("issue_100");
    },
    60000
  );
});
