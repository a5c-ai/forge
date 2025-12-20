import { describe, expect, it } from "vitest";
import { runCli } from "../src/run.js";
import { makeEmptyRepo } from "./_util.js";

describe("CLI real workflow (maturization)", () => {
  it("can run a basic issue + pr workflow end-to-end", async () => {
    const repo = await makeEmptyRepo("a5cforge-cli-flow-");
    process.env.A5C_ACTOR = "alice";

    // 1) Create issue
    let out = "";
    let code = await runCli(["issue", "new", "--repo", repo, "--id", "issue-flow-1", "--title", "Flow issue", "--commit"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out.trim()).toBe("issue-flow-1");

    // 2) Add a comment
    out = "";
    code = await runCli(["issue", "comment", "issue-flow-1", "--repo", repo, "--comment-id", "c-flow-1", "-m", "hello", "--commit"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out.trim()).toBe("c-flow-1");

    // 3) Needs-human gate
    out = "";
    code = await runCli(["gate", "needs-human", "issue-flow-1", "--repo", repo, "--topic", "review", "-m", "needs eyes", "--commit"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out).toContain(".collab/");

    // 4) Claim the work (agent dispatch is what an agent would react to)
    out = "";
    code = await runCli(["agent", "dispatch", "--repo", repo, "--entity", "issue-flow-1", "--dispatch-id", "d-flow-1", "--task", "implement"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out).toContain(".collab/agents/events/");

    // 5) Create PR request
    out = "";
    code = await runCli(["pr", "request", "--repo", repo, "--id", "pr-flow-1", "--base", "refs/heads/main", "--title", "Do the thing", "--commit"], {
      stdout: (s) => (out += s),
      stderr: () => {}
    });
    expect(code).toBe(0);
    expect(out.trim()).toBe("pr-flow-1");

    // 6) Sanity: status + show JSON reflect the repo
    out = "";
    code = await runCli(["status", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    const st = JSON.parse(out);
    expect(st).toMatchObject({ treeish: "HEAD", issues: 1, prs: 1 });

    out = "";
    code = await runCli(["issue", "show", "issue-flow-1", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    const issue = JSON.parse(out);
    expect(issue.issueId).toBe("issue-flow-1");
    expect(issue.comments.map((c: any) => c.commentId)).toContain("c-flow-1");

    out = "";
    code = await runCli(["pr", "show", "pr-flow-1", "--repo", repo, "--json"], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    const pr = JSON.parse(out);
    expect(pr).toMatchObject({ prKey: "pr-flow-1", kind: "request" });

    // 7) Journal includes the new events
    process.env.A5C_NOW_ISO = new Date().toISOString();
    out = "";
    code = await runCli(["journal", "--repo", repo, "--since", "2h", "--types", "issue.*,comment.*,pr.*"], { stdout: (s) => (out += s), stderr: () => {} });
    expect(code).toBe(0);
    expect(out).toContain("issue.event.created");
    expect(out).toContain("comment.created");
    expect(out).toContain("pr.request.created");
  }, 20_000);
});


