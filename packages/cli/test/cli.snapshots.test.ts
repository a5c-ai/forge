import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { runCli } from "../src/run.js";

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

async function makeRepoFromFixture(fixtureName: string): Promise<string> {
  const root = path.resolve(import.meta.dirname, "../../..");
  const fixture = path.join(root, "fixtures", fixtureName);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `a5cforge-cli-${fixtureName}-`));
  await copyDir(fixture, dir);
  await run("git", ["init", "-q", "-b", "main"], dir);
  await run("git", ["add", "-A"], dir);
  await run("git", ["add", "-f", ".collab"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "fixture"], dir);
  return dir;
}

describe("CLI (Phase 4)", () => {
  it("status (repo-basic)", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    let out = "";
    const code = await runCli(["status", "--repo", repo], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out).toBe(["treeish: HEAD", "issues: 2", "prs: 2", ""].join("\n"));
  });

  it("issue list (repo-basic)", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    let out = "";
    const code = await runCli(["issue", "list", "--repo", repo], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out).toBe(["issue-1", "issue-2", ""].join("\n"));
  });

  it("pr show --json (repo-basic)", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    let out = "";
    const code = await runCli(["pr", "show", "pr-2", "--json", "--repo", repo], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    const pr = JSON.parse(out);
    expect(pr).toMatchObject({
      prKey: "pr-2",
      kind: "request",
      baseRef: "refs/heads/main"
    });
    expect(pr.events).toHaveLength(2);
  });

  it("journal filters by --since and --types", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_NOW_ISO = "2025-12-19T14:50:00Z";
    let out = "";
    const code = await runCli(
      ["journal", "--repo", repo, "--since", "20m", "--types", "pr.*"],
      { stdout: (s) => (out += s), stderr: () => {} }
    );
    expect(code).toBe(0);
    // Should include pr-related events only, newest first.
    expect(out).toContain("pr.event.created");
  });
});


