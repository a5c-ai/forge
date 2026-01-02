import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/run.js";
import { makeEmptyRepo } from "./_util.js";

describe("CLI o", () => {
  it("prints help", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["o", "help"], {
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s)
    });

    expect(code).toBe(0);
    expect(out.join("")).toContain("git a5c o init");
    expect(err.join("")).toBe("");
  });

  it("errors when running a request with no A5C_CLI_COMMAND", async () => {
    const repo = await makeEmptyRepo("a5cforge-cli-o-missing-");

    const out: string[] = [];
    const err: string[] = [];
    const prev = process.env.A5C_CLI_COMMAND;
    delete process.env.A5C_CLI_COMMAND;
    try {
      const code = await runCli(["o", "do something", "--repo", repo], {
        stdout: (s) => out.push(s),
        stderr: (s) => err.push(s)
      });

      expect(code).toBe(2);
      expect(out.join("")).toBe("");
      expect(err.join("")).toContain("A5C_CLI_COMMAND");
    } finally {
      if (prev != null) process.env.A5C_CLI_COMMAND = prev;
    }
  });

  it("o init copies .a5c/functions and .a5c/processes from a local registry", async () => {
    const repo = await makeEmptyRepo("a5cforge-cli-o-init-");
    const root = path.resolve(import.meta.dirname, "../../..");

    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["o", "init", "--registry", root, "--repo", repo], {
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s)
    });

    expect(code).toBe(0);
    expect(err.join("")).toBe("");

    await expect(fs.stat(path.join(repo, ".a5c", "o.md"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(repo, ".a5c", "functions", "act.md"))).resolves.toBeTruthy();

    const procs = await fs.readdir(path.join(repo, ".a5c", "processes"));
    expect(procs.filter((p) => p.endsWith(".js")).length).toBeGreaterThan(0);
  });

  it("runs request via A5C_CLI_COMMAND and passes rendered prompt on stdin", async () => {
    const repo = await makeEmptyRepo("a5cforge-cli-o-run-");
    await fs.mkdir(path.join(repo, ".a5c"), { recursive: true });
    await fs.writeFile(path.join(repo, ".a5c", "o.md"), "REQ={{request}}\n", "utf8");
    await fs.writeFile(
      path.join(repo, "echo-stdin.js"),
      [
        "let s='';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', d => s += d);",
        "process.stdin.on('end', () => { process.stdout.write(s); });"
      ].join("\n"),
      "utf8"
    );

    const prev = process.env.A5C_CLI_COMMAND;
    process.env.A5C_CLI_COMMAND = "node echo-stdin.js";
    try {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runCli(["o", "hello world", "--repo", repo], {
        stdout: (s) => out.push(s),
        stderr: (s) => err.push(s)
      });

      expect(code).toBe(0);
      expect(err.join("")).toBe("");
      expect(out.join("")).toContain("REQ=hello world");
    } finally {
      if (prev == null) delete process.env.A5C_CLI_COMMAND;
      else process.env.A5C_CLI_COMMAND = prev;
    }
  });
});
