import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { runCli } from "../src/run.js";
import { listenOnce, makeRepoFromFixture, run } from "./_util.js";

function runCliBin(binPath: string, args: string[], cwd: string, stdinText: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.stdin.write(stdinText, "utf8");
    child.stdin.end();
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
}

describe("CLI end-to-end (hooks + block + webhook + parse + orchestration)", () => {
  it(
    "runs a mixed workflow across subsystems",
    async () => {
      const repo = await makeRepoFromFixture("repo-orchestration-repo-min");

      // 1) hooks install/uninstall (filesystem only; not committed).
      expect(await runCli(["hooks", "install", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
      const hooksDir = path.join(repo, ".git", "hooks");
      const postCommit = await fs.readFile(path.join(hooksDir, "post-commit"), "utf8");
      expect(postCommit).toContain("A5C-HOOK-MANAGED: yes");
      expect(await runCli(["hooks", "uninstall", "--repo", repo], { stdout: () => {}, stderr: () => {} })).toBe(0);
      await expect(fs.stat(path.join(hooksDir, "post-commit"))).rejects.toThrow();

      // 2) Create an issue and PR, then add/remove a dependency block.
      expect(
        await runCli(["issue", "new", "--repo", repo, "--id", "issue_blk", "--title", "Blocker", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);
      expect(
        await runCli(["pr", "request", "--repo", repo, "--id", "pr_blk", "--base", "main", "--title", "Work", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);
      expect(
        await runCli(["block", "issue_blk", "--repo", repo, "--by", "pr_blk", "--op", "add", "-m", "blocked", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);
      expect(
        await runCli(["block", "issue_blk", "--repo", repo, "--by", "pr_blk", "--op", "remove", "-m", "unblocked", "--commit"], {
          stdout: () => {},
          stderr: () => {}
        })
      ).toBe(0);

      // 3) webhook status + webhook test (local HTTP server).
      const webhooksPath = path.join(repo, ".collab", "webhooks.json");
      await fs.mkdir(path.dirname(webhooksPath), { recursive: true });
      await fs.writeFile(
        webhooksPath,
        JSON.stringify(
          {
            schema: "a5cforge/v1",
            endpoints: [{ id: "local", url: "http://127.0.0.1:0", events: ["cli.test"], enabled: true }]
          },
          null,
          2
        ),
        "utf8"
      );
      await run("git", ["add", "-A"], repo);
      await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add webhooks"], repo);

      let statusOut = "";
      expect(await runCli(["webhook", "status", "--repo", repo, "--json"], { stdout: (s) => (statusOut += s), stderr: () => {} })).toBe(0);
      const status = JSON.parse(statusOut);
      expect(Array.isArray(status.endpoints)).toBe(true);

      let gotEnvelope: any;
      const srv = await listenOnce(async (_req, body) => {
        gotEnvelope = JSON.parse(body.toString("utf8"));
      });
      try {
        expect(
          await runCli(["webhook", "test", "--repo", repo, "--url", srv.url, "--type", "cli.test"], { stdout: () => {}, stderr: () => {} })
        ).toBe(0);
      } finally {
        await srv.close();
      }
      expect(gotEnvelope.schema).toBe("a5cforge/v1");
      expect(gotEnvelope.type).toBe("cli.test");

      // 4) parse codex stdout sample via CLI binary (spawned, stdin-driven).
      const root = path.resolve(import.meta.dirname, "../../..");
      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");
      const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample.txt"), "utf8");
      const parseRes = await runCliBin(binPath, ["parse", "--repo", repo, "--type", "codex", "--out", "codex.jsonl"], repo, sample);
      expect(parseRes.code).toBe(0);
      const parsedFile = await fs.readFile(path.join(repo, "codex.jsonl"), "utf8");
      expect(parsedFile).toContain('"type":"banner"');

      // 5) orchestration (agent hook calls generate-context + agent run via subprocess).
      const oldA5cCli = process.env.A5C_CLI;
      process.env.A5C_CLI = binPath;
      try {
        expect(
          await runCli(["run", "dispatch", "--repo", repo, "--playbook", "playbooks/web_feature.yaml@v1", "--run-id", "run_040"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);
        expect(
          await runCli(["run", "tick", "--repo", repo, "--run-id", "run_040", "--max-transitions", "10"], {
            stdout: () => {},
            stderr: () => {}
          })
        ).toBe(0);
      } finally {
        if (oldA5cCli === undefined) delete process.env.A5C_CLI;
        else process.env.A5C_CLI = oldA5cCli;
      }

      const runEventsDir = path.join(repo, ".collab", "runs", "run_040", "events");
      const runEventNames = (await fs.readdir(runEventsDir)).sort();
      expect(runEventNames.some((n) => n.includes("run.step.failed"))).toBe(false);
      expect(runEventNames.some((n) => n.includes("run.reward.reported"))).toBe(true);
    },
    60000
  );
});
