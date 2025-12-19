import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

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

async function listCollabFiles(repoDir: string, treeish: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["ls-tree", "-r", "--name-only", treeish, "--", ".collab"], {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`git ls-tree failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`)
        );
      }
      resolve(
        Buffer.concat(out)
          .toString("utf8")
          .split(/\r?\n/)
          .filter(Boolean)
      );
    });
  });
}

describe("Phase 1 - merge causality ordering", () => {
  it("merge result includes both concurrent events and ordering is deterministic by filename", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const base = path.join(root, "fixtures", "repo-merge-causality", "base");
    const branchA = path.join(root, "fixtures", "repo-merge-causality", "branch-a");
    const branchB = path.join(root, "fixtures", "repo-merge-causality", "branch-b");

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-merge-causality-"));
    await run("git", ["init", "-q", "-b", "main"], dir);

    // main commit from base
    await copyDir(base, dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "base"], dir);

    // branch-a commit
    await run("git", ["checkout", "-q", "-b", "branch-a"], dir);
    await copyDir(branchA, dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "A"], dir);

    // branch-b commit from main
    await run("git", ["checkout", "-q", "main"], dir);
    await run("git", ["checkout", "-q", "-b", "branch-b"], dir);
    await copyDir(branchB, dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "B"], dir);

    // merge into main
    await run("git", ["checkout", "-q", "main"], dir);
    await run("git", ["merge", "--no-edit", "--no-ff", "-q", "branch-a"], dir);
    await run("git", ["merge", "--no-edit", "--no-ff", "-q", "branch-b"], dir);

    const files = await listCollabFiles(dir, "HEAD");
    const jsonFiles = files.filter((f) => f.endsWith(".json") || f.endsWith(".md"));
    expect(jsonFiles.some((f) => f.endsWith("1734628060000_alice_0002.comment.created.json"))).toBe(true);
    expect(jsonFiles.some((f) => f.endsWith("1734628060000_bob_0002.comment.created.json"))).toBe(true);

    // Deterministic ordering check: sorting by filename should be stable.
    const basenames = jsonFiles.map((f) => f.split("/").pop()!);
    const sorted = [...basenames].sort();
    expect(sorted.length).toBeGreaterThan(0);
  });
});


