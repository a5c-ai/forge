import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI end-to-end (issue + gate + agent/ops + journal + orchestration)", () => {
  it(
    "writes collab events then runs an orchestration playbook",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // 1) Write issue + comment + gate + heartbeat + deploy (all committed).
      let issueId = "";
      let commentId = "";

      let out = "";
      expect(
        await runCli(
          ["issue", "new", "--repo", repo, "--id", "issue_001", "--title", "Hello", "--body", "Body", "--commit"],
          { stdout: (s) => (out += s), stderr: () => {} }
        )
      ).toBe(0);
      issueId = out.trim();
      expect(issueId).toBe("issue_001");

      out = "";
      expect(
        await runCli(
          ["issue", "comment", issueId, "--repo", repo, "--comment-id", "c_001", "-m", "First", "--commit"],
          { stdout: (s) => (out += s), stderr: () => {} }
        )
      ).toBe(0);
      commentId = out.trim();
      expect(commentId).toBe("c_001");

      expect(
        await runCli(
          ["gate", "needs-human", issueId, "--repo", repo, "--topic", "review", "-m", "need review", "--commit"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      expect(
        await runCli(
          [
            "agent",
            "heartbeat",
            "--repo",
            repo,
            "--agent-id",
            "agent_001",
            "--ttl-seconds",
            "3600",
            "--entity",
            issueId,
            "-m",
            "alive",
            "--commit"
          ],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      expect(
        await runCli(
          ["ops", "deploy", "--repo", repo, "--entity", issueId, "--artifact", "file://artifact.tgz", "-m", "deployed", "--commit"],
          { stdout: () => {}, stderr: () => {} }
        )
      ).toBe(0);

      // 2) Journal should see the collab events for this issue.
      out = "";
      expect(
        await runCli(["journal", "--repo", repo, "--entity", issueId, "--active", "--json", "--limit", "50"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(0);
      const journal = JSON.parse(out);
      const events = Array.isArray(journal.events) ? journal.events : journal;
      const kinds = new Set(events.map((e: any) => e.kind));
      expect(kinds.has("issue.event.created")).toBe(true);
      expect(kinds.has("comment.created")).toBe(true);
      expect(kinds.has("gate.changed")).toBe(true);
      expect(kinds.has("agent.heartbeat.created")).toBe(true);
      expect(kinds.has("ops.event.created")).toBe(true);
      expect(Array.isArray(journal.activeAgents)).toBe(true);
      expect(journal.activeAgents.length).toBe(1);

      // 3) Now run orchestration dispatch + tick.
      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");
      const oldA5cCli = process.env.A5C_CLI;
      process.env.A5C_CLI = cliEntrypoint;
      try {
        expect(
          await runCli(
            ["run", "dispatch", "--repo", repo, "--playbook", "playbooks/web_feature.yaml@v1", "--run-id", "run_020"],
            { stdout: () => {}, stderr: () => {} }
          )
        ).toBe(0);
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_020", "--max-transitions", "10"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }

      const runEventsDir = path.join(repo, ".collab", "runs", "run_020", "events");
      const runEventNames = (await fs.readdir(runEventsDir)).sort();
      expect(runEventNames.some((n) => n.includes("run.step.failed"))).toBe(false);
      expect(runEventNames.some((n) => n.includes("run.reward.reported"))).toBe(true);
    },
    60000
  );
});
