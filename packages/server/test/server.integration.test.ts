import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createA5cServer } from "../src/server.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `a5cforge-server-${fixtureName}-`));
  await copyDir(fixture, dir);
  await run("git", ["init", "-q", "-b", "main"], dir);
  await run("git", ["add", "-A"], dir);
  await run("git", ["add", "-f", ".collab"], dir);
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "fixture"], dir);
  return dir;
}

describe("a5c-server (Phase 7)", () => {
  it("serves status and can create a comment that shows up in rendered issue", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_SERVER_REPO = repo;
    delete process.env.A5C_SERVER_TOKEN;

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;
      const status = await fetch(`${base}/v1/status`).then((r) => r.json());
      expect(status).toMatchObject({ treeish: "HEAD", issues: 2, prs: 2 });

      const post = await fetch(`${base}/v1/issues/issue-1/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", body: "hello from server test", commentId: "comment-x" })
      }).then((r) => r.json());
      expect(post).toMatchObject({ committed: true });

      const issue = await fetch(`${base}/v1/issues/issue-1`).then((r) => r.json());
      expect(issue.issueId).toBe("issue-1");
      expect(issue.comments.map((c: any) => c.commentId)).toContain("comment-x");
    } finally {
      await srv.close();
    }
  });

  it("can create a PR request and it shows up in list/render", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_SERVER_REPO = repo;
    delete process.env.A5C_SERVER_TOKEN;

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;
      const post = await fetch(`${base}/v1/prs/pr-req-1/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "bob", baseRef: "main", title: "Request: do the thing", body: "please" })
      }).then((r) => r.json());
      expect(post).toMatchObject({ committed: true });

      const list = await fetch(`${base}/v1/prs`).then((r) => r.json());
      expect(list.map((p: any) => p.prKey)).toContain("pr-req-1");

      const pr = await fetch(`${base}/v1/prs/pr-req-1`).then((r) => r.json());
      expect(pr).toMatchObject({ prKey: "pr-req-1", kind: "request", baseRef: "main", title: "Request: do the thing" });
    } finally {
      await srv.close();
    }
  });
});


