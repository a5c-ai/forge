import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { GET as statusGET } from "../app/api/status/route";
import { GET as issuesGET } from "../app/api/issues/route";
import { POST as commentPOST } from "../app/api/issues/[id]/comments/route";
import { POST as prRequestPOST } from "../app/api/prs/[key]/request/route";

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

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.copyFile(s, d);
  }
}

async function makeRepoFromFixture(fixtureName: string): Promise<string> {
  const root = path.resolve(import.meta.dirname, "../../..");
  const fixture = path.join(root, "fixtures", fixtureName);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `a5cforge-ui-${fixtureName}-`));
  await copyDir(fixture, dir);
  await run("git", ["init", "-q", "-b", "main"], dir);
  await run("git", ["add", "-A"], dir);
  await run("git", ["add", "-f", ".collab"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "fixture"], dir);
  return dir;
}

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
});


