import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/run.js";
import { run } from "./_util.js";

async function writeJson(p: string, obj: any) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

describe("CLI git sync", () => {
  it("auto-pulls on read commands (ff-only) when origin has new commits", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-cli-sync-read-"));
    const bare = path.join(tmp, "origin.git");
    const workA = path.join(tmp, "a");
    const workB = path.join(tmp, "b");

    await run("git", ["init", "--bare", "-q", bare], tmp);
    await run("git", ["clone", "-q", bare, workA], tmp);
    await run("git", ["-C", workA, "checkout", "-q", "-b", "main"], tmp);
    await run("git", ["-C", workA, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-q", "-m", "init"], tmp);
    await run("git", ["-C", workA, "push", "-q", "-u", "origin", "main"], tmp);
    await run("git", ["--git-dir", bare, "symbolic-ref", "HEAD", "refs/heads/main"], tmp);

    await run("git", ["clone", "-q", bare, workB], tmp);
    await run("git", ["-C", workB, "checkout", "-q", "-b", "main", "--track", "origin/main"], tmp);

    const evPath = path.join(workB, ".collab", "issues", "issue-3", "events", "2025", "12", "1734629400000_test_0001.issue.event.created.json");
    await writeJson(evPath, {
      schema: "a5cforge/v1",
      kind: "issue.event.created",
      id: "evt_issue-3_0001",
      time: "2025-12-19T14:50:00.000Z",
      actor: "test",
      payload: { issueId: "issue-3", title: "From origin", state: "open" }
    });
    await run("git", ["-C", workB, "add", "-A"], tmp);
    await run("git", ["-C", workB, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add issue-3"], tmp);
    await run("git", ["-C", workB, "push", "-q", "-u", "origin", "main"], tmp);

    let out = "";
    let err = "";
    const code = await runCli(["status", "--repo", workA], { stdout: (s) => (out += s), stderr: (s) => (err += s) });
    expect(code).toBe(0);
    expect(err).toBe("");
    expect(out).toContain("issues: 1"); // empty init repo would be 0, after pull includes new issue event committed on origin
  }, 20000);

  it("write commands can --sync (pull then push) after committing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-cli-sync-write-"));
    const bare = path.join(tmp, "origin.git");
    const work = path.join(tmp, "w");

    await run("git", ["init", "--bare", "-q", bare], tmp);
    await run("git", ["clone", "-q", bare, work], tmp);
    await run("git", ["-C", work, "checkout", "-q", "-b", "main"], tmp);
    await run("git", ["-C", work, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-q", "-m", "init"], tmp);
    await run("git", ["-C", work, "push", "-q", "-u", "origin", "main"], tmp);

    let out = "";
    const code = await runCli(
      ["issue", "new", "--repo", work, "--title", "sync test", "--commit", "--sync"],
      { stdout: (s) => (out += s), stderr: () => {} }
    );
    expect(code).toBe(0);

    const localHead = (await run("git", ["-C", work, "rev-parse", "HEAD"], tmp)).stdout.trim();
    const remoteHead = (await run("git", ["--git-dir", bare, "rev-parse", "refs/heads/main"], tmp)).stdout.trim();
    expect(remoteHead).toBe(localHead);
    expect(out.trim()).toMatch(/^issue-/);
  }, 30000);
});
