import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { stageFiles } from "../src/write/stage.js";

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

async function gitStatusPorcelain(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["status", "--porcelain"], { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(out).toString("utf8"));
      reject(new Error(`git status failed: ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

describe("stageFiles", () => {
  it("stages specified paths", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-stage-"));
    await run("git", ["init", "-q", "-b", "main"], dir);
    await fs.writeFile(path.join(dir, "a.txt"), "hi\n", "utf8");
    await stageFiles(dir, ["a.txt"]);
    const st = await gitStatusPorcelain(dir);
    expect(st).toContain("A  a.txt");
  });
});


