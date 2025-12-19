import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { openRepo } from "../src/repo/openRepo.js";

function run(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${cmd} ${args.join(" ")} failed (code=${code}): ${stderr}`));
    });
  });
}

describe("ShellGit", () => {
  it("revParse/lsTree/readBlob work on a temporary repo", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-sdk-"));
    await run("git", ["init", "-q"], dir);
    await fs.mkdir(path.join(dir, "x"), { recursive: true });
    await fs.writeFile(path.join(dir, "x", "a.txt"), "hello\n", "utf8");
    await run("git", ["add", "."], dir);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "init"], dir);

    const repo = await openRepo(dir);
    const head = await repo.git.revParse("HEAD");
    expect(head).toMatch(/^[0-9a-f]{40}$/);

    const rootEntries = await repo.git.lsTree(head, "");
    expect(rootEntries.some((e) => e.type === "tree" && e.path === "x")).toBe(true);

    const xEntries = await repo.git.lsTree(head, "x");
    expect(xEntries.some((e) => e.type === "blob" && e.path === "a.txt")).toBe(true);

    const buf = await repo.git.readBlob(head, "x/a.txt");
    expect(buf.toString("utf8")).toBe("hello\n");
  });
});


