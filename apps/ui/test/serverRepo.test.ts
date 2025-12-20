import { describe, expect, it } from "vitest";
import { makeRepoFromFixture } from "./_util.js";
import { getRenderedIssue, getRenderedIssues, getRenderedPR, getRenderedPRs } from "../lib/serverRepo";

describe("serverRepo helpers", () => {
  it("renders issues and PRs from env repo", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";

    const issues = await getRenderedIssues();
    expect(issues.map((i: any) => i.issueId).sort()).toEqual(["issue-1", "issue-2"]);

    const issue1 = await getRenderedIssue("issue-1");
    expect(issue1).toBeTruthy();
    expect((issue1 as any).issueId).toBe("issue-1");

    const prs = await getRenderedPRs();
    expect(prs.map((p: any) => p.prKey).sort()).toEqual(["pr-1", "pr-2"]);

    const pr2 = await getRenderedPR("pr-2");
    expect(pr2).toBeTruthy();
    expect((pr2 as any).prKey).toBe("pr-2");
  });
});


