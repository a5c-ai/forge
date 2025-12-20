import { describe, expect, it } from "vitest";
import { runCli } from "../src/run.js";
import { makeRepoFromFixture } from "./_util.js";

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


