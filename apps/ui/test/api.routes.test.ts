import { describe, expect, it } from "vitest";
import { GET as statusGET } from "../app/api/status/route";
import { GET as issuesGET } from "../app/api/issues/route";
import { POST as commentPOST } from "../app/api/issues/[id]/comments/route";
import { POST as prRequestPOST } from "../app/api/prs/[key]/request/route";
import { POST as issueGatePOST } from "../app/api/issues/[id]/gate/route";
import { POST as issueBlockersPOST } from "../app/api/issues/[id]/blockers/route";
import { POST as issueClaimPOST } from "../app/api/issues/[id]/claim/route";
import { POST as prClaimPOST } from "../app/api/prs/[key]/claim/route";
import { makeRepoFromFixture } from "./_util.js";

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


