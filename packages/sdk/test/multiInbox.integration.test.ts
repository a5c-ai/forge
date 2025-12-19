import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { openRepo, loadSnapshot, renderPR } from "../src/index.js";

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const err: Buffer[] = [];
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

describe("multi-inbox (integration)", () => {
  it("loads inbox refs and deterministically selects a PR root event", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const fixtureRoot = path.join(root, "fixtures", "repo-multi-inbox");
    const base = path.join(fixtureRoot, "base");
    const inboxA = path.join(fixtureRoot, "inbox-a");
    const inboxB = path.join(fixtureRoot, "inbox-b");

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-multi-inbox-"));
    await run("git", ["init", "-q", "-b", "main"], dir);

    // main commit from base
    await copyDir(base, dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    // base may be empty; allow-empty keeps the test structure consistent.
    await run(
      "git",
      ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-q", "-m", "base"],
      dir
    );

    // create inbox-a ref
    await run("git", ["checkout", "-q", "-b", "inbox-a"], dir);
    await copyDir(inboxA, dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "inbox-a"], dir);
    await run("git", ["update-ref", "refs/a5c/inbox/a", "HEAD"], dir);

    // create inbox-b ref
    await run("git", ["checkout", "-q", "main"], dir);
    await run("git", ["checkout", "-q", "-b", "inbox-b"], dir);
    await copyDir(inboxB, dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "inbox-b"], dir);
    await run("git", ["update-ref", "refs/a5c/inbox/b", "HEAD"], dir);

    await run("git", ["checkout", "-q", "main"], dir);

    const repo = await openRepo(dir);
    const snap = await loadSnapshot({ git: repo.git, treeish: "HEAD", inboxRefs: ["refs/a5c/inbox/a", "refs/a5c/inbox/b"] });
    const pr = renderPR(snap, "pr-1");
    expect(pr).toBeTruthy();
    // Deterministic: proposal A wins because actor "alice" sorts before "bob" at same time.
    expect(pr!.headRef).toBe("refs/heads/feature-a");
  });
});


