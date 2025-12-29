import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

describe("CLI end-to-end (pr + gate/ops + verify/journal + orchestration)", () => {
  it(
    "writes PR events, gates it, runs ops, verifies, then runs orchestration",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      const prKey = "pr-001";

      // 1) PR request + claim + bind head.
      let out = "";
      expect(
        await runCli(
          ["pr", "request", "--repo", repo, "--id", prKey, "--base", "main", "--title", "Do thing", "--commit"],
          { stdout: (s) => (out += s), stderr: () => {} }
        )
      ).toBe(0);
      expect(out.trim()).toBe(prKey);

      expect(
        await runCli(["pr", "claim", prKey, "--repo", repo, "--head-ref", "refs/heads/feature", "-m", "claimed", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      expect(
        await runCli(["pr", "bind-head", prKey, "--repo", repo, "--head-ref", "refs/heads/feature", "-m", "bound", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      // 2) Gate it, then clear the gate.
      expect(
        await runCli(["gate", "needs-human", prKey, "--repo", repo, "--topic", "review", "-m", "need review", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);
      expect(
        await runCli(["gate", "clear", prKey, "--repo", repo, "-m", "ok", "--commit"], { stdout: () => {}, stderr: () => {} })
      ).toBe(0);

      // 3) Run ops build + test against the PR.
      expect(
        await runCli(["ops", "build", "--repo", repo, "--entity", prKey, "--artifact", "file://build.tgz", "-m", "built", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);
      expect(
        await runCli(["ops", "test", "--repo", repo, "--entity", prKey, "--artifact", "file://test.tgz", "-m", "tested", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      // 4) Verify should succeed (schema/ordering sanity checks).
      let verifyOut = "";
      expect(await runCli(["verify", "--repo", repo], { stdout: (s) => (verifyOut += s), stderr: () => {} })).toBe(0);
      expect(verifyOut).toContain("events:");

      // 5) Journal should show PR-related events.
      out = "";
      expect(
        await runCli(["journal", "--repo", repo, "--entity", prKey, "--json", "--limit", "50"], {
          stdout: (s) => (out += s),
          stderr: () => {}
        })
      ).toBe(0);
      const journal = JSON.parse(out);
      const events = Array.isArray(journal) ? journal : journal.events;
      const kinds = new Set((events ?? []).map((e: any) => e.kind));
      expect(kinds.has("pr.request.created") || kinds.has("pr.event.created")).toBe(true);
      expect(kinds.has("gate.changed")).toBe(true);
      expect(kinds.has("ops.event.created")).toBe(true);

      // 6) Orchestration: run a small playbook in the same repo.
      const root = path.resolve(import.meta.dirname, "../../..");
      const cliEntrypoint = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");
      const oldA5cCli = process.env.A5C_CLI;
      process.env.A5C_CLI = cliEntrypoint;
      try {
        expect(
          await runCli(["run", "dispatch", "--repo", repo, "--playbook", "playbooks/web_feature.yaml@v1", "--run-id", "run_030"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_030", "--max-transitions", "10"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }

      const runEventsDir = path.join(repo, ".collab", "runs", "run_030", "events");
      const runEventNames = (await fs.readdir(runEventsDir)).sort();
      expect(runEventNames.some((n) => n.includes("run.step.failed"))).toBe(false);
      expect(runEventNames.some((n) => n.includes("run.reward.reported"))).toBe(true);
    },
    60000
  );
});

