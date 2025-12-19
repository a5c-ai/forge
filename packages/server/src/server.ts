import http from "node:http";
import { URL } from "node:url";
import { spawn } from "node:child_process";
import { HlcClock, loadHlcState, loadSnapshot, openRepo, renderIssue, renderPR, saveHlcState, writeCommentCreated, writePrRequest } from "@a5cforge/sdk";
import { listIssues, listPRs } from "@a5cforge/sdk";

export type ServerConfig = {
  repoRoot: string;
  token?: string;
};

type Json = any;

function readEnvConfig(): ServerConfig {
  const repoRoot = process.env.A5C_SERVER_REPO ?? process.env.A5C_REPO;
  if (!repoRoot) throw new Error("Missing A5C_SERVER_REPO (or A5C_REPO)");
  const token = process.env.A5C_SERVER_TOKEN ?? process.env.A5C_REMOTE_TOKEN;
  return { repoRoot, token };
}

function sendJson(res: http.ServerResponse, status: number, obj: Json) {
  const body = JSON.stringify(obj, null, 2) + "\n";
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(body);
}

async function readJson(req: http.IncomingMessage, maxBytes = 256_000): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const b = Buffer.from(c as any);
    total += b.length;
    if (total > maxBytes) throw new Error("Request body too large");
    chunks.push(b);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function requireAuth(req: http.IncomingMessage, token?: string): boolean {
  if (!token) return true;
  const hdr = req.headers["authorization"];
  if (!hdr) return false;
  const m = /^Bearer\s+(.+)$/.exec(String(hdr));
  return !!m && m[1] === token;
}

function parseInboxRefs(u: URL): string[] | undefined {
  const inbox = u.searchParams.get("inbox");
  if (inbox) {
    const refs = inbox
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return refs.length ? refs : undefined;
  }
  const many = u.searchParams.getAll("inboxRef").map((s) => s.trim()).filter(Boolean);
  return many.length ? many : undefined;
}

function runGit(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const err: Buffer[] = [];
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`git ${args.join(" ")} failed (code=${code}): ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

export function createA5cServer(overrides?: Partial<ServerConfig>) {
  const cfg = { ...readEnvConfig(), ...(overrides ?? {}) };

  const server = http.createServer(async (req, res) => {
    try {
      if (!requireAuth(req, cfg.token)) {
        return sendJson(res, 401, { error: "unauthorized" });
      }

      const u = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const treeish = u.searchParams.get("treeish") ?? "HEAD";
      const inboxRefs = parseInboxRefs(u);

      // v1 read
      if (req.method === "GET" && u.pathname === "/v1/status") {
        const repo = await openRepo(cfg.repoRoot);
        const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs });
        return sendJson(res, 200, { treeish, issues: listIssues(snap).length, prs: listPRs(snap).length });
      }
      if (req.method === "GET" && u.pathname === "/v1/issues") {
        const repo = await openRepo(cfg.repoRoot);
        const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs });
        const ids = listIssues(snap);
        return sendJson(res, 200, ids.map((id) => renderIssue(snap, id)).filter(Boolean));
      }
      {
        const m = /^\/v1\/issues\/([^/]+)$/.exec(u.pathname);
        if (req.method === "GET" && m) {
          const id = decodeURIComponent(m[1]);
          const repo = await openRepo(cfg.repoRoot);
          const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs });
          const issue = renderIssue(snap, id);
          if (!issue) return sendJson(res, 404, { error: "not found" });
          return sendJson(res, 200, issue);
        }
      }
      if (req.method === "GET" && u.pathname === "/v1/prs") {
        const repo = await openRepo(cfg.repoRoot);
        const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs });
        const keys = listPRs(snap);
        return sendJson(res, 200, keys.map((k) => renderPR(snap, k)).filter(Boolean));
      }
      {
        const m = /^\/v1\/prs\/([^/]+)$/.exec(u.pathname);
        if (req.method === "GET" && m) {
          const key = decodeURIComponent(m[1]);
          const repo = await openRepo(cfg.repoRoot);
          const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs });
          const pr = renderPR(snap, key);
          if (!pr) return sendJson(res, 404, { error: "not found" });
          return sendJson(res, 200, pr);
        }
      }

      // v1 write: create comment on issue
      {
        const m = /^\/v1\/issues\/([^/]+)\/comments$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const issueId = decodeURIComponent(m[1]);
          const body = (await readJson(req)) ?? {};
          const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "server");
          const commentBody = String(body.body ?? "");
          if (!commentBody.trim()) return sendJson(res, 400, { error: "missing body" });
          const commentId = String(body.commentId ?? `c_${Date.now()}`);

          const repo = await openRepo(cfg.repoRoot);
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const time = new Date().toISOString();
          const wr = await writeCommentCreated(
            { repoRoot: repo.root, actor, clock },
            { entity: { type: "issue", id: issueId }, commentId, body: commentBody, time }
          );
          await saveHlcState(actor, clock.now());

          // default commit so reads at HEAD reflect the new event
          const commit = u.searchParams.get("commit");
          const doCommit = commit == null ? true : commit === "1" || commit === "true";
          if (doCommit) {
            await runGit(["add", "-A"], repo.root);
            const msg = String(body.message ?? `a5c: comment ${issueId} ${commentId}`);
            await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
          }

          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 write: create PR request (root event)
      {
        const m = /^\/v1\/prs\/([^/]+)\/request$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const prKey = decodeURIComponent(m[1]);
          const body = (await readJson(req)) ?? {};
          const actor = String(body.actor ?? process.env.A5C_ACTOR ?? "server");
          const baseRef = String(body.baseRef ?? "");
          const title = String(body.title ?? "");
          const prBody = body.body == null ? undefined : String(body.body);
          if (!baseRef.trim()) return sendJson(res, 400, { error: "missing baseRef" });
          if (!title.trim()) return sendJson(res, 400, { error: "missing title" });

          const repo = await openRepo(cfg.repoRoot);
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const time = new Date().toISOString();
          const wr = await writePrRequest({ repoRoot: repo.root, actor, clock }, { prKey, baseRef, title, body: prBody, time });
          await saveHlcState(actor, clock.now());

          const commit = u.searchParams.get("commit");
          const doCommit = commit == null ? true : commit === "1" || commit === "true";
          if (doCommit) {
            await runGit(["add", "-A"], repo.root);
            const msg = String(body.message ?? `a5c: pr request ${prKey}`);
            await runGit(["-c", `user.name=${actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repo.root);
          }

          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      return sendJson(res, 404, { error: "not found" });
    } catch (e: any) {
      return sendJson(res, 400, { error: String(e?.message ?? e) });
    }
  });

  return {
    server,
    listen(port: number) {
      return new Promise<number>((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, () => {
          const addr = server.address();
          const actual = typeof addr === "object" && addr ? addr.port : port;
          resolve(actual);
        });
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  };
}


