import { describe, expect, it } from "vitest";
import { GET as statusGET } from "../app/api/status/route";
import { GET as issuesGET } from "../app/api/issues/route";
import { POST as issuesPOST } from "../app/api/issues/route";
import { POST as commentPOST } from "../app/api/issues/[id]/comments/route";
import { POST as prRequestPOST } from "../app/api/prs/[key]/request/route";
import { POST as prProposalPOST } from "../app/api/prs/[key]/proposal/route";
import { POST as issueGatePOST } from "../app/api/issues/[id]/gate/route";
import { POST as issueBlockersPOST } from "../app/api/issues/[id]/blockers/route";
import { POST as issueClaimPOST } from "../app/api/issues/[id]/claim/route";
import { POST as prClaimPOST } from "../app/api/prs/[key]/claim/route";
import { makeRepoFromFixture, runCapture } from "./_util.js";

describe("UI API routes (Phase 6)", () => {
  it("GET /api/status returns counts", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    const res = await statusGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ treeish: "HEAD", issues: 2, prs: 2 });
  });

  it("GET /api/issues returns rendered issues", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    const res = await issuesGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((x: any) => x.issueId).sort()).toEqual(["issue-1", "issue-2"]);
  });

  it("POST /api/issues/[id]/comments writes a comment and it shows up in rendered issue", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    process.env.A5C_ACTOR = "alice";
    delete process.env.A5C_REMOTE_URL;
    delete process.env.A5C_REMOTE_TOKEN;

    const req = new Request("http://local/api/issues/issue-1/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hello from ui test", commentId: "ui-comment-1" })
    });
    const res = await commentPOST(req, { params: Promise.resolve({ id: "issue-1" }) } as any);
    expect(res.status).toBe(200);

    // Re-render via SDK-backed issue route (treeish HEAD updated by commit).
    const issueRes = await (await import("../app/api/issues/[id]/route")).GET(
      new Request("http://local/api/issues/issue-1"),
      { params: Promise.resolve({ id: "issue-1" }) } as any
    );
    const issue = await issueRes.json();
    expect(issue.issueId).toBe("issue-1");
    expect(issue.comments.map((c: any) => c.commentId)).toContain("ui-comment-1");
  });

  it("POST /api/prs/[key]/request creates a PR request that shows up in rendered PR list", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    process.env.A5C_ACTOR = "alice";
    delete process.env.A5C_REMOTE_URL;
    delete process.env.A5C_REMOTE_TOKEN;

    const req = new Request("http://local/api/prs/pr-req-1/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRef: "main", title: "Request: UI test", body: "pls" })
    });
    const res = await prRequestPOST(req, { params: Promise.resolve({ key: "pr-req-1" }) } as any);
    expect(res.status).toBe(200);

    const prsRes = await (await import("../app/api/prs/route")).GET();
    const prs = await prsRes.json();
    expect(prs.map((p: any) => p.prKey)).toContain("pr-req-1");

    const prRes = await (await import("../app/api/prs/[key]/route")).GET(
      new Request("http://local/api/prs/pr-req-1"),
      { params: Promise.resolve({ key: "pr-req-1" }) } as any
    );
    const pr = await prRes.json();
    expect(pr).toMatchObject({ prKey: "pr-req-1", kind: "request", baseRef: "main", title: "Request: UI test" });
  });

  it("POST /api/issues and PR writes go to inbox ref (not checked-out branch)", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    process.env.A5C_ACTOR = "alice";
    delete process.env.A5C_REMOTE_URL;
    delete process.env.A5C_REMOTE_TOKEN;

    const inboxRef = "refs/a5c/inbox/ui-test";
    const mainBefore = (await runCapture("git", ["rev-parse", "main"], repo)).trim();

    const issueReq = new Request("http://local/api/issues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Inbox issue", inboxRefs: [inboxRef], treeish: "main" })
    });
    const issueRes = await issuesPOST(issueReq);
    expect(issueRes.status).toBe(200);
    const issueJson = await issueRes.json();
    expect(issueJson).toMatchObject({ committed: true });

    const prReq = new Request("http://local/api/prs/pr-inbox-1/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRef: "main", title: "Inbox PR request", inboxRefs: [inboxRef], treeish: "main" })
    });
    const prRes = await prRequestPOST(prReq, { params: Promise.resolve({ key: "pr-inbox-1" }) } as any);
    expect(prRes.status).toBe(200);

    const prPropReq = new Request("http://local/api/prs/pr-inbox-2/proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRef: "main", headRef: "feature/x", title: "Inbox PR proposal", inboxRefs: [inboxRef], treeish: "main" })
    });
    const prPropRes = await prProposalPOST(prPropReq, { params: Promise.resolve({ key: "pr-inbox-2" }) } as any);
    expect(prPropRes.status).toBe(200);

    const mainAfter = (await runCapture("git", ["rev-parse", "main"], repo)).trim();
    expect(mainAfter).toBe(mainBefore);

    const inboxCommit = (await runCapture("git", ["rev-parse", inboxRef], repo)).trim();
    expect(inboxCommit).not.toBe(mainBefore);

    // Ensure the inbox commit includes the written events (don’t rely on returned paths).
    const paths = (await runCapture("git", ["ls-tree", "-r", "--name-only", inboxRef], repo))
      .split(/\r?\n/)
      .filter(Boolean);

    const issueId = String(issueJson.issueId ?? "");
    expect(issueId.startsWith("issue-")).toBe(true);
    const issueCreatedPath = paths.find(
      (p) => p.startsWith(`.collab/issues/${issueId}/events/`) && p.endsWith(".issue.event.created.json")
    );
    expect(issueCreatedPath).toBeTruthy();
    const issueContents = await runCapture("git", ["show", `${inboxRef}:${issueCreatedPath}`], repo);
    expect(issueContents).toContain("issue.event.created");

    const prReqPath = paths.find((p) => p.startsWith(".collab/prs/pr-inbox-1/events/") && p.endsWith(".pr.request.created.json"));
    expect(prReqPath).toBeTruthy();
    const prReqContents = await runCapture("git", ["show", `${inboxRef}:${prReqPath}`], repo);
    expect(prReqContents).toContain("pr.request.created");

    const prPropPath = paths.find(
      (p) => p.startsWith(".collab/prs/pr-inbox-2/events/") && p.endsWith(".pr.proposal.created.json")
    );
    expect(prPropPath).toBeTruthy();
    const prPropContents = await runCapture("git", ["show", `${inboxRef}:${prPropPath}`], repo);
    expect(prPropContents).toContain("pr.proposal.created");
  });

  it("POST /api/issues/[id]/gate and /blockers update rendered issue", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    process.env.A5C_ACTOR = "alice";
    delete process.env.A5C_REMOTE_URL;
    delete process.env.A5C_REMOTE_TOKEN;

    const gateReq = new Request("http://local/api/issues/issue-1/gate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ needsHuman: true, topic: "review", message: "pls" })
    });
    const gateRes = await issueGatePOST(gateReq, { params: Promise.resolve({ id: "issue-1" }) } as any);
    expect(gateRes.status).toBe(200);

    const addReq = new Request("http://local/api/issues/issue-1/blockers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "add", by: { type: "issue", id: "issue-2" }, note: "depends" })
    });
    const addRes = await issueBlockersPOST(addReq, { params: Promise.resolve({ id: "issue-1" }) } as any);
    expect(addRes.status).toBe(200);

    const issueRes = await (await import("../app/api/issues/[id]/route")).GET(
      new Request("http://local/api/issues/issue-1"),
      { params: Promise.resolve({ id: "issue-1" }) } as any
    );
    const issue = await issueRes.json();
    expect(issue.needsHuman).toMatchObject({ topic: "review", message: "pls" });
    expect(issue.blockers?.map((b: any) => `${b.by.type}:${b.by.id}`)).toContain("issue:issue-2");

    const rmReq = new Request("http://local/api/issues/issue-1/blockers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "remove", by: { type: "issue", id: "issue-2" } })
    });
    const rmRes = await issueBlockersPOST(rmReq, { params: Promise.resolve({ id: "issue-1" }) } as any);
    expect(rmRes.status).toBe(200);

    const issueRes2 = await (await import("../app/api/issues/[id]/route")).GET(
      new Request("http://local/api/issues/issue-1"),
      { params: Promise.resolve({ id: "issue-1" }) } as any
    );
    const issue2 = await issueRes2.json();
    expect(issue2.blockers ?? []).toHaveLength(0);
  });

  it("POST /api/issues/[id]/claim and /api/prs/[key]/claim update rendered entities", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_REPO = repo;
    process.env.A5C_TREEISH = "HEAD";
    process.env.A5C_ACTOR = "alice";
    delete process.env.A5C_REMOTE_URL;
    delete process.env.A5C_REMOTE_TOKEN;

    const claimReq = new Request("http://local/api/issues/issue-1/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "agent-1", op: "claim", note: "working" })
    });
    const claimRes = await issueClaimPOST(claimReq, { params: Promise.resolve({ id: "issue-1" }) } as any);
    expect(claimRes.status).toBe(200);

    const issueRes = await (await import("../app/api/issues/[id]/route")).GET(
      new Request("http://local/api/issues/issue-1"),
      { params: Promise.resolve({ id: "issue-1" }) } as any
    );
    const issue = await issueRes.json();
    expect(issue.agentClaims?.map((c: any) => c.agentId)).toContain("agent-1");

    // Create a PR request first, then claim it.
    await prRequestPOST(
      new Request("http://local/api/prs/pr-claim-1/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRef: "main", title: "Request: claim me" })
      }),
      { params: Promise.resolve({ key: "pr-claim-1" }) } as any
    );
    const prClaimRes = await prClaimPOST(
      new Request("http://local/api/prs/pr-claim-1/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "agent-2", op: "claim" })
      }),
      { params: Promise.resolve({ key: "pr-claim-1" }) } as any
    );
    expect(prClaimRes.status).toBe(200);

    const prRes = await (await import("../app/api/prs/[key]/route")).GET(
      new Request("http://local/api/prs/pr-claim-1"),
      { params: Promise.resolve({ key: "pr-claim-1" }) } as any
    );
    const pr = await prRes.json();
    expect(pr.agentClaims?.map((c: any) => c.agentId)).toContain("agent-2");
  });
});


