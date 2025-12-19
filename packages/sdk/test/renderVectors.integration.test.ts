import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { listIssues, listPRs, loadSnapshot, openRepo, renderIssue, renderPR } from "../src/index.js";

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

async function readJson(p: string) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

describe("render vectors", () => {
  it("repo-basic renders to spec/vectors/repo-basic.render.json", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const fixture = path.join(root, "fixtures", "repo-basic");
    const expectedPath = path.join(root, "spec", "vectors", "repo-basic.render.json");

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-vector-"));
    await copyDir(fixture, dir);
    await run("git", ["init", "-q", "-b", "main"], dir);
    await run("git", ["add", "-A"], dir);
    await run("git", ["add", "-f", ".collab"], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "fixture"], dir);

    const repo = await openRepo(dir);
    const snap = await loadSnapshot({ git: repo.git, treeish: "HEAD" });

    const issues = listIssues(snap)
      .map((id) => renderIssue(snap, id)!)
      .filter(Boolean);
    const prs = listPRs(snap)
      .map((k) => renderPR(snap, k)!)
      .filter(Boolean);

    const actual = { schema: "a5cforge/v1", fixture: "repo-basic", issues, prs };
    const expected = await readJson(expectedPath);

    expect(actual).toEqual(expected);
  });
});


