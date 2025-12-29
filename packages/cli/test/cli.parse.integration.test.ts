import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { makeEmptyRepo } from "./_util.js";

function runParse(binPath: string, args: string[], cwd: string, stdinText: string): Promise<{ code: number; stdout: string; stderr: string }> {
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

describe("CLI parse --type codex", () => {
  it(
    "parses codex stdout into JSONL events",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-parse-");
      const root = path.resolve(import.meta.dirname, "../../..");
      const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample.txt"), "utf8");
      const outFile = path.join(repo, "parsed.jsonl");

      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");
      const res = await runParse(binPath, ["parse", "--repo", repo, "--type", "codex", "--out", "parsed.jsonl"], repo, sample);
      expect(res.code).toBe(0);
      expect(res.stderr).toBe("");
      expect(res.stdout).toContain("\"type\":\"banner\"");
      expect(res.stdout).toContain("\"type\":\"thinking\"");
      expect(res.stdout).toContain("\"type\":\"exec\"");
      expect(res.stdout).toContain("\"type\":\"exec_result\"");
      expect(res.stdout).toContain("\"type\":\"tokens_used\"");

      const persisted = await fs.readFile(outFile, "utf8");
      expect(persisted).toContain("\"type\":\"banner\"");
      expect(persisted).toContain("\"tokens\":123");
    },
    30000
  );

  it(
    "writes JSONL to --out while pretty-printing to stdout",
    async () => {
      const repo = await makeEmptyRepo("a5cforge-cli-parse-pretty-");
      const root = path.resolve(import.meta.dirname, "../../..");
      const sample = await fs.readFile(path.join(root, "fixtures", "codex-stdout-sample.txt"), "utf8");
      const outFile = path.join(repo, "pretty.jsonl");

      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");
      const res = await runParse(binPath, ["parse", "--repo", repo, "--type", "codex", "--out", "pretty.jsonl", "--pretty"], repo, sample);
      expect(res.code).toBe(0);

      // pretty should produce multi-line JSON to stdout
      expect(res.stdout.split(/\r?\n/).filter(Boolean).length).toBeGreaterThan(6);

      // file should be JSONL
      const persisted = await fs.readFile(outFile, "utf8");
      const lines = persisted
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      expect(lines.length).toBeGreaterThan(3);
      for (const l of lines) {
        const obj = JSON.parse(l);
        expect(typeof obj).toBe("object");
      }
    },
    30000
  );
});
