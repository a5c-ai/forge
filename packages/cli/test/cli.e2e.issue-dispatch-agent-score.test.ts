import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI end-to-end (issue → dispatch playbook → agent context+run → score)", () => {
  it(
    "creates an issue, runs orchestration, and computes evidence-based reward",
    async () => {
      const repo = await makeRepoFromFixture("repo-e2e-issue-agent-score");

      // Make sure issue event timestamps are deterministic so the prompt template
      // can include them via git://HEAD/.collab/issues/<id>/events/**/*.json.
      const prevNow = process.env.A5C_NOW_ISO;
      process.env.A5C_NOW_ISO = "2025-12-01T00:00:00.000Z";

      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const prevA5cCli = process.env.A5C_CLI;
      const prevIssue = process.env.A5C_TEST_ISSUE_ID;
      const prevRatio = process.env.A5C_TEST_DIFF_RATIO;
      process.env.A5C_CLI = cliEntrypoint;
      process.env.A5C_TEST_ISSUE_ID = "issue_100";
      process.env.A5C_TEST_DIFF_RATIO = "0.01";

      try {
        // 1) Create an issue that the playbook references.
        let out = "";
        expect(
          await runCli(
            [
              "issue",
              "new",
              "--repo",
              repo,
              "--id",
              "issue_100",
              "--title",
              "E2E",
              "--body",
              "Do thing",
              "--commit"
            ],
            { stdout: (s) => (out += s), stderr: () => {} }
          )
        ).toBe(0);
        expect(out.trim()).toBe("issue_100");

        // 2) Dispatch the playbook.
        expect(
          await runCli(
            [
              "run",
              "dispatch",
              "--repo",
              repo,
              "--playbook",
              "playbooks/issue_agent_score.yaml@v1",
              "--run-id",
              "run_050"
            ],
            { stdout: () => {}, stderr: () => {} }
          )
        ).toBe(0);

        // 3) Tick through agent step (generate-context + agent run) and reward scoring.
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_050", "--max-transitions", "10"], {
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

      // 4) Verify the agent prompt contains the issue id and raw issue event.
      const promptPath = path.join(repo, ".a5c", "tmp", "run_050", "step_1", "attempt_1", "prompt.md");
      const prompt = await fs.readFile(promptPath, "utf8");
      expect(prompt).toContain("Issue id:");
      expect(prompt).toContain("issue_100");
      expect(prompt).toContain("issue.event.created");

      // 5) Verify reward was computed from evidence producers.
      const eventsDir = path.join(repo, ".collab", "runs", "run_050", "events");
      const names = (await fs.readdir(eventsDir)).sort();
      const rewardFile = names.find((n) => n.includes("__run.reward.reported__s2__a1__"));
      expect(rewardFile).toBeTruthy();
      const reward = JSON.parse(await fs.readFile(path.join(eventsDir, rewardFile!), "utf8"));
      expect(reward.payload.reward_total).toBe(1);
      expect(reward.payload.signals).toBeTruthy();
    },
    60000
  );
});

