import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { makeRepoFromFixture } from "./_util.js";

function runBin(binPath: string, args: string[], cwd: string, stdinText?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    if (stdinText != null) child.stdin.write(stdinText, "utf8");
    child.stdin.end();
    child.on("close", (code) => resolve({ code: code ?? 0, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
  });
}

describe("CLI agent run (upstream parity)", () => {
  it(
    "supports --in - (stdin prompt)",
    async () => {
      const repo = await makeRepoFromFixture("repo-agent-run-predefined");
      const root = path.resolve(import.meta.dirname, "../../..");
      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const res = await runBin(
        binPath,
        ["agent", "run", "--repo", repo, "--profile", "default", "--in", "-", "--out", "out.md", "--model", "mstdin"],
        repo,
        "From stdin\n"
      );
      expect(res.code).toBe(0);

      const out = await fs.readFile(path.join(repo, "out.md"), "utf8");
      expect(out).toContain("From stdin");
    },
    30000
  );

  it(
    "runs cli.install when present",
    async () => {
      const repo = await makeRepoFromFixture("repo-agent-run-predefined");
      const root = path.resolve(import.meta.dirname, "../../..");
      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const cfgPath = path.join(repo, "install-override.yaml");
      await fs.writeFile(
        cfgPath,
        [
          "cli:",
          "  echo:",
          "    install: \"node -e \\\"require('fs').writeFileSync('install.marker','1')\\\"\""
        ].join("\n"),
        "utf8"
      );

      const res = await runBin(
        binPath,
        [
          "agent",
          "run",
          "--repo",
          repo,
          "--profile",
          "default",
          "--config",
          "install-override.yaml",
          "--in",
          "prompt.md",
          "--out",
          "out.md"
        ],
        repo
      );
      expect(res.code).toBe(0);
      expect(await fs.readFile(path.join(repo, "install.marker"), "utf8")).toBe("1");
    },
    30000
  );

  it(
    "supports file:// URIs for --in",
    async () => {
      const repo = await makeRepoFromFixture("repo-agent-run-predefined");
      const root = path.resolve(import.meta.dirname, "../../..");
      const binPath = path.join(root, "packages", "cli", "dist", "bin", "git-a5c.js");

      const promptUri = `file://${path.join(repo, "prompt.md").replace(/\\/g, "/")}`;
      const res = await runBin(
        binPath,
        ["agent", "run", "--repo", repo, "--profile", "default", "--in", promptUri, "--out", "out.md"],
        repo
      );
      expect(res.code).toBe(0);

      const out = await fs.readFile(path.join(repo, "out.md"), "utf8");
      expect(out).toContain("This is a prompt");
    },
    30000
  );
});
