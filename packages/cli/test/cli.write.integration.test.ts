import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { runCli } from "../src/run.js";
import { makeEmptyRepo, run } from "./_util.js";

describe("CLI write commands (Phase 5)", () => {
  it("issue new --stage-only creates and stages a file", async () => {
    const repo = await makeEmptyRepo();
    let out = "";
    const code = await runCli(["issue", "new", "--title", "T", "--repo", repo, "--stage-only"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^issue-/);
    const st = (await run("git", ["status", "--porcelain"], repo)).stdout;
    expect(st).toContain("A  ");
    expect(st).toContain(".collab/");
  });

  it("hooks install is idempotent", async () => {
    const repo = await makeEmptyRepo();
    let out1 = "";
    const c1 = await runCli(["hooks", "install", "--repo", repo], { stdout: (s) => (out1 += s), stderr: () => {} });
    expect(c1).toBe(0);
    expect(out1.trim()).toBe("ok");

    let out2 = "";
    const c2 = await runCli(["hooks", "install", "--repo", repo], { stdout: (s) => (out2 += s), stderr: () => {} });
    expect(c2).toBe(0);
    expect(out2.trim()).toBe("ok");
  });

  it("hooks uninstall only removes managed hooks", async () => {
    const repo = await makeEmptyRepo();
    // Install managed hook first.
    await runCli(["hooks", "install", "--repo", repo], { stdout: () => {}, stderr: () => {} });

    // Create an unmanaged hook and ensure uninstall doesn't delete it.
    const hooksDirRaw = (await run("git", ["rev-parse", "--git-path", "hooks"], repo)).stdout.trim();
    const hooksDir = path.isAbsolute(hooksDirRaw) ? hooksDirRaw : path.join(repo, hooksDirRaw);
    await fs.mkdir(hooksDir, { recursive: true });
    const unmanaged = path.join(hooksDir, "pre-commit");
    await fs.writeFile(unmanaged, "#!/bin/sh\necho unmanaged\n", "utf8");

    let out = "";
    const code = await runCli(["hooks", "uninstall", "--repo", repo], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out.trim()).toBe("ok");

    const still = await fs.readFile(unmanaged, "utf8");
    expect(still).toContain("unmanaged");
  });

  it("agent dispatch writes agent.dispatch.created event", async () => {
    const repo = await makeEmptyRepo();
    process.env.A5C_ACTOR = "agent1";
    let out = "";
    const code = await runCli(["agent", "dispatch", "--repo", repo, "--entity", "issue-1", "--stage-only"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out).toContain(".collab/agents/events/");
    const st = (await run("git", ["status", "--porcelain"], repo)).stdout;
    expect(st).toContain(".collab/agents/events/");
  });
});


