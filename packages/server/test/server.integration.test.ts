import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createA5cServer } from "../src/server.js";
import { loadSnapshot, openRepo, renderPR } from "@a5cforge/sdk";
import crypto from "node:crypto";
import http from "node:http";

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

function runCapture(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(out).toString("utf8"));
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

  it("can set issue needsHuman gate and add/remove blockers", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_SERVER_REPO = repo;
    delete process.env.A5C_SERVER_TOKEN;

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;

      const gate = await fetch(`${base}/v1/issues/issue-1/gate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", needsHuman: true, topic: "review", message: "please take a look" })
      }).then((r) => r.json());
      expect(gate).toMatchObject({ committed: true });

      const add = await fetch(`${base}/v1/issues/issue-1/blockers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", op: "add", by: { type: "issue", id: "issue-2" }, note: "depends on issue-2" })
      }).then((r) => r.json());
      expect(add).toMatchObject({ committed: true });

      const issue1 = await fetch(`${base}/v1/issues/issue-1`).then((r) => r.json());
      expect(issue1.needsHuman).toMatchObject({ topic: "review", message: "please take a look" });
      expect(issue1.blockers?.map((b: any) => `${b.by.type}:${b.by.id}`)).toContain("issue:issue-2");

      const remove = await fetch(`${base}/v1/issues/issue-1/blockers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", op: "remove", by: { type: "issue", id: "issue-2" } })
      }).then((r) => r.json());
      expect(remove).toMatchObject({ committed: true });

      const issue2 = await fetch(`${base}/v1/issues/issue-1`).then((r) => r.json());
      expect(issue2.blockers ?? []).toHaveLength(0);
    } finally {
      await srv.close();
    }
  });

  it("can claim/release an issue and a PR", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_SERVER_REPO = repo;
    delete process.env.A5C_SERVER_TOKEN;

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;

      const claimIssue = await fetch(`${base}/v1/issues/issue-1/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", agentId: "agent-1", op: "claim", note: "working" })
      }).then((r) => r.json());
      expect(claimIssue).toMatchObject({ committed: true });

      const issue = await fetch(`${base}/v1/issues/issue-1`).then((r) => r.json());
      expect(issue.agentClaims?.map((c: any) => c.agentId)).toContain("agent-1");

      const releaseIssue = await fetch(`${base}/v1/issues/issue-1/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", agentId: "agent-1", op: "release" })
      }).then((r) => r.json());
      expect(releaseIssue).toMatchObject({ committed: true });

      const issue2 = await fetch(`${base}/v1/issues/issue-1`).then((r) => r.json());
      expect(issue2.agentClaims ?? []).toHaveLength(0);

      // PR: create a request root so it exists, then claim it.
      await fetch(`${base}/v1/prs/pr-claim-1/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "bob", baseRef: "main", title: "Request: claim me" })
      });
      const claimPr = await fetch(`${base}/v1/prs/pr-claim-1/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "bob", agentId: "agent-2", op: "claim" })
      }).then((r) => r.json());
      expect(claimPr).toMatchObject({ committed: true });

      const pr = await fetch(`${base}/v1/prs/pr-claim-1`).then((r) => r.json());
      expect(pr.agentClaims?.map((c: any) => c.agentId)).toContain("agent-2");
    } finally {
      await srv.close();
    }
  });

  it("accepts GitHub pull_request webhook and writes proposal into inbox ref", async () => {
    const repo = await makeRepoFromFixture("repo-basic");
    process.env.A5C_SERVER_REPO = repo;
    delete process.env.A5C_SERVER_TOKEN;
    process.env.A5C_GITHUB_INBOX_REF = "refs/a5c/inbox/github-test";
    process.env.A5C_GITHUB_WEBHOOK_SECRET = "sekrit";

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;
      const payload = {
        action: "opened",
        pull_request: {
          number: 42,
          title: "Add webhook ingestion",
          body: "This came from GitHub",
          created_at: "2025-12-19T14:34:20Z",
          base: { ref: "main" },
          head: { ref: "feature/webhook" }
        },
        sender: { login: "octocat" }
      };
      const raw = Buffer.from(JSON.stringify(payload), "utf8");
      const sig = crypto.createHmac("sha256", process.env.A5C_GITHUB_WEBHOOK_SECRET).update(raw).digest("hex");

      const resp = await fetch(`${base}/v1/webhooks/github`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "pull_request",
          "x-hub-signature-256": `sha256=${sig}`
        },
        body: raw
      }).then((r) => r.json());
      expect(resp.ok).toBe(true);

      // Verify via SDK loadSnapshot(inboxRefs) that proposal is visible.
      const h = await openRepo(repo);
      const snap = await loadSnapshot({ git: h.git, treeish: "HEAD", inboxRefs: [process.env.A5C_GITHUB_INBOX_REF!] });
      const pr = renderPR(snap, "pr-gh-42");
      expect(pr).toBeTruthy();
      expect(pr?.kind).toBe("proposal");
      expect(pr?.inboxProposals?.[0]?.title).toBe("Add webhook ingestion");
    } finally {
      await srv.close();
    }
  });

  it("delivers outgoing a5cforge webhooks on committed writes (signed)", async () => {
    const repo = await makeRepoFromFixture("repo-basic");

    // Add a webhooks config into the repo.
    const whPath = path.join(repo, ".collab", "webhooks.json");
    await fs.mkdir(path.dirname(whPath), { recursive: true });

    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();

    const received: any[] = [];
    const receiver = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c as any));
      const raw = Buffer.concat(chunks);
      received.push({
        headers: req.headers,
        body: JSON.parse(raw.toString("utf8"))
      });
      res.statusCode = 200;
      res.end("ok");
    });

    const recvPort = await new Promise<number>((resolve, reject) => {
      receiver.on("error", reject);
      receiver.listen(0, "127.0.0.1", () => {
        const addr = receiver.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    await fs.writeFile(
      whPath,
      JSON.stringify(
        {
          schema: "a5cforge/v1",
          endpoints: [{ id: "local", url: `http://127.0.0.1:${recvPort}/recv`, events: ["comment.*"], enabled: true }]
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await run("git", ["add", "-A"], repo);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add webhooks"], repo);

    process.env.A5C_SERVER_REPO = repo;
    process.env.A5C_WEBHOOK_ALLOW_HOSTS = "127.0.0.1,localhost";
    process.env.A5C_WEBHOOK_KEY_ID = "testkey";
    process.env.A5C_WEBHOOK_PRIVATE_KEY_PEM = privatePem;

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;
      await fetch(`${base}/v1/issues/issue-1/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "alice", body: "webhook test", commentId: "wh-1" })
      });

      // Wait (best-effort) for receiver to get it.
      for (let i = 0; i < 50 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
      expect(received.length).toBeGreaterThan(0);

      const msg = received[0];
      expect(msg.body.schema).toBe("a5cforge/v1");
      expect(String(msg.body.type)).toBe("comment.created");
      expect(String(msg.body.id)).toContain(":");

      // Verify signature headers.
      const signed = String(msg.headers["a5c-signed"] ?? "");
      const sigHdr = String(msg.headers["a5c-signature"] ?? "");
      expect(signed.startsWith("sha256:")).toBe(true);
      const m = /^ed25519;([^;]+);(.+)$/.exec(sigHdr);
      expect(m?.[1]).toBe("testkey");
      const sig = Buffer.from(m?.[2] ?? "", "base64");
      const hex = signed.slice("sha256:".length);
      const ok = crypto.verify(null, Buffer.from(hex, "hex"), publicPem, sig);
      expect(ok).toBe(true);
    } finally {
      await srv.close();
      receiver.close();
      delete process.env.A5C_WEBHOOK_ALLOW_HOSTS;
      delete process.env.A5C_WEBHOOK_KEY_ID;
      delete process.env.A5C_WEBHOOK_PRIVATE_KEY_PEM;
    }
  });

  it("emits git.* webhooks on ref update", async () => {
    const repo = await makeRepoFromFixture("repo-basic");

    // Make a new commit to ensure there is a ref movement.
    await fs.writeFile(path.join(repo, "README.tmp.txt"), "x\n", "utf8");
    await run("git", ["add", "-A"], repo);
    const before = (await runCapture("git", ["rev-parse", "HEAD"], repo)).trim();
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "tmp"], repo);
    const oldOid = before || "0000000000000000000000000000000000000000";
    const newOid = (await runCapture("git", ["rev-parse", "HEAD"], repo)).trim();

    const received: any[] = [];
    const receiver = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c as any));
      received.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      res.statusCode = 200;
      res.end("ok");
    });
    const recvPort = await new Promise<number>((resolve, reject) => {
      receiver.on("error", reject);
      receiver.listen(0, "127.0.0.1", () => {
        const addr = receiver.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });

    const whPath = path.join(repo, ".collab", "webhooks.json");
    await fs.mkdir(path.dirname(whPath), { recursive: true });
    await fs.writeFile(
      whPath,
      JSON.stringify({ schema: "a5cforge/v1", endpoints: [{ id: "local", url: `http://127.0.0.1:${recvPort}/recv`, events: ["git.*"], enabled: true }] }, null, 2) + "\n",
      "utf8"
    );
    await run("git", ["add", "-A"], repo);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add webhooks"], repo);

    process.env.A5C_SERVER_REPO = repo;
    process.env.A5C_WEBHOOK_ALLOW_HOSTS = "127.0.0.1,localhost";
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    process.env.A5C_WEBHOOK_KEY_ID = "testkey";
    process.env.A5C_WEBHOOK_PRIVATE_KEY_PEM = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;
      const resp = await fetch(`${base}/v1/git/ref-updated`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: "refs/heads/main", oldOid, newOid, actor: "test" })
      }).then((r) => ({ status: r.status, body: r.json() }));
      expect(resp.status).toBe(200);

      for (let i = 0; i < 50 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
      const types = received.map((x) => x.body.type).sort();
      expect(types).toContain("git.ref.updated");
      expect(types).toContain("git.tree.changed");
      expect(types).toContain("git.commit.created");
    } finally {
      await srv.close();
      receiver.close();
      delete process.env.A5C_WEBHOOK_ALLOW_HOSTS;
      delete process.env.A5C_WEBHOOK_KEY_ID;
      delete process.env.A5C_WEBHOOK_PRIVATE_KEY_PEM;
    }
  });

  it("can enforce client signatures for write endpoints", async () => {
    const repo = await makeRepoFromFixture("repo-basic");

    // Install client public key into repo.
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pubPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const privPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const clientId = "client-1";

    const p = path.join(repo, ".collab", "keys", "clients");
    await fs.mkdir(p, { recursive: true });
    await fs.writeFile(path.join(p, `${clientId}.pub`), pubPem, "utf8");
    await run("git", ["add", "-A"], repo);
    await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "add client key"], repo);

    process.env.A5C_SERVER_REPO = repo;
    delete process.env.A5C_SERVER_TOKEN;
    process.env.A5C_REQUIRE_CLIENT_SIGNATURE = "1";

    const srv = createA5cServer();
    const port = await srv.listen(0);
    try {
      const base = `http://127.0.0.1:${port}`;

      const payload = { body: "signed write", commentId: "sig-1" };
      // Compute sha256(JCS(payload)) == sha256(JSON with sorted keys for this simple object).
      const jcs = JSON.stringify(payload);
      const hashHex = crypto.createHash("sha256").update(Buffer.from(jcs, "utf8")).digest("hex");
      const sig = crypto.sign(null, Buffer.from(hashHex, "hex"), privPem).toString("base64");

      const r = await fetch(`${base}/v1/issues/issue-1/comments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "a5c-client": clientId,
          "a5c-client-signature": `ed25519;${clientId};${sig}`
        },
        body: JSON.stringify(payload)
      });
      expect(r.status).toBe(200);
    } finally {
      await srv.close();
      delete process.env.A5C_REQUIRE_CLIENT_SIGNATURE;
    }
  });
});


