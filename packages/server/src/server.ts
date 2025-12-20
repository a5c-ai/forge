import http from "node:http";
import { URL } from "node:url";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { readRaw, sendJson } from "./http/io.js";
import { runGit, runGitCapture } from "./git/exec.js";
import { resolveActorFromClientSig } from "./auth/clientSig.js";
import { emitEnvelope, loadWebhooksConfig, type WebhooksConfig } from "./webhooks/outgoing.js";
import {
  HlcClock,
  loadHlcState,
  loadSnapshot,
  openRepo,
  renderIssue,
  renderPR,
  saveHlcState,
  writeAgentClaimChanged,
  writeCommentCreated,
  writeDepChanged,
  writeGateChanged,
  writePrProposal,
  writePrRequest
} from "@a5cforge/sdk";
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonOrEmpty(raw: Buffer): any {
  const s = raw.toString("utf8").trim();
  if (!s) return {};
  return JSON.parse(s);
}

async function readJsonObject(req: http.IncomingMessage, maxBytes = 256_000): Promise<any> {
  const raw = await readRaw(req, maxBytes);
  return parseJsonOrEmpty(raw);
}

async function maybeCommitAndEmit(args: {
  repoRoot: string;
  actor: string;
  doCommit: boolean;
  message: string;
  path: string;
  event: any;
}) {
  if (!args.doCommit) return;
  await runGit(["add", "-A"], args.repoRoot);
  await runGit(["-c", `user.name=${args.actor}`, "-c", "user.email=a5c@example.invalid", "commit", "-m", args.message], args.repoRoot);
  const commit = (await runGitCapture(["rev-parse", "HEAD"], args.repoRoot)).trim();
  await emitA5cforgeWebhook({ repoRoot: args.repoRoot, commit, path: args.path, event: args.event });
}

async function readJson(req: http.IncomingMessage, maxBytes = 256_000): Promise<any> {
  const raw = (await readRaw(req, maxBytes)).toString("utf8").trim();
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

function verifyGitHubHmac(req: http.IncomingMessage, rawBody: Buffer, secret?: string): boolean {
  if (!secret) return true;
  const sig = String(req.headers["x-hub-signature-256"] ?? "");
  const m = /^sha256=([0-9a-f]{64})$/i.exec(sig);
  if (!m) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // timing-safe compare
  const a = Buffer.from(m[1].toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function emitA5cforgeWebhook(args: { repoRoot: string; commit: string; path: string; event: any }) {
  const cfg: WebhooksConfig | undefined = await loadWebhooksConfig(args.repoRoot);
  const serverId = process.env.A5C_SERVER_ID ?? "server";
  const repoId = process.env.A5C_REPO_ID ?? path.basename(args.repoRoot);
  const envelope = {
    schema: "a5cforge/v1",
    type: String(args.event?.kind ?? "unknown"),
    id: `${repoId}:${args.commit}:${args.path}:${String(args.event?.id ?? "unknown")}`,
    time: new Date().toISOString(),
    repo: { id: repoId, path: args.repoRoot },
    source: { serverId, keyId: process.env.A5C_WEBHOOK_KEY_ID ?? undefined },
    data: { path: args.path, event: args.event }
  };
  await emitEnvelope(args.repoRoot, cfg, envelope);
}

async function emitGitWebhook(args: { repoRoot: string; ref: string; seq: number; eventType: string; data: any }) {
  const cfg: WebhooksConfig | undefined = await loadWebhooksConfig(args.repoRoot);
  const serverId = process.env.A5C_SERVER_ID ?? "server";
  const repoId = process.env.A5C_REPO_ID ?? path.basename(args.repoRoot);
  const envelope = {
    schema: "a5cforge/v1",
    type: args.eventType,
    id: `${repoId}:${args.data?.newOid ?? "unknown"}:${args.ref}:${args.seq}`,
    time: new Date().toISOString(),
    repo: { id: repoId, path: args.repoRoot },
    source: { serverId, keyId: process.env.A5C_WEBHOOK_KEY_ID ?? undefined },
    data: args.data
  };
  await emitEnvelope(args.repoRoot, cfg, envelope);
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

async function writeToInboxRef<T>(repoRoot: string, inboxRef: string, fn: (worktreeDir: string) => Promise<T>): Promise<{ result: T; commit: string }> {
  const wt = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-inbox-"));
  const tmpBranch = `a5cforge-inbox-tmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  try {
    // Create an empty worktree (no checkout), then orphan-commit only .collab content.
    await runGit(["worktree", "add", "--detach", "--no-checkout", wt, "HEAD"], repoRoot);
    await runGit(["checkout", "--orphan", tmpBranch], wt);

    const res = await fn(wt);
    await runGit(["add", "-A"], wt);
    await runGit(["-c", "user.name=a5c-server", "-c", "user.email=a5c@example.invalid", "commit", "-m", `a5c: inbox ${inboxRef}`], wt);
    const commit = (await runGitCapture(["rev-parse", "HEAD"], wt)).trim();
    await runGit(["update-ref", inboxRef, commit], repoRoot);
    return { result: res, commit };
  } finally {
    try {
      await runGit(["worktree", "remove", "--force", wt], repoRoot);
    } catch {}
    try {
      await runGit(["branch", "-D", tmpBranch], repoRoot);
    } catch {}
    try {
      await fs.rm(wt, { recursive: true, force: true });
    } catch {}
  }
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
          const body = await readJsonObject(req);
          const { actor } = await resolveActorFromClientSig(cfg.repoRoot, req, body);
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
          const msg = String(body.message ?? `a5c: comment ${issueId} ${commentId}`);
          await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 write: create PR request (root event)
      {
        const m = /^\/v1\/prs\/([^/]+)\/request$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const prKey = decodeURIComponent(m[1]);
          const body = await readJsonObject(req);
          const { actor } = await resolveActorFromClientSig(cfg.repoRoot, req, body);
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
          const msg = String(body.message ?? `a5c: pr request ${prKey}`);
          await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 write: issue gate (needsHuman)
      {
        const m = /^\/v1\/issues\/([^/]+)\/gate$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const issueId = decodeURIComponent(m[1]);
          const body = await readJsonObject(req);
          const { actor } = await resolveActorFromClientSig(cfg.repoRoot, req, body);
          const needsHuman = Boolean(body.needsHuman);
          const topic = body.topic == null ? undefined : String(body.topic);
          const message = body.message == null ? undefined : String(body.message);

          const repo = await openRepo(cfg.repoRoot);
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const time = new Date().toISOString();
          const wr = await writeGateChanged(
            { repoRoot: repo.root, actor, clock },
            { entity: { type: "issue", id: issueId }, needsHuman, topic, message, time }
          );
          await saveHlcState(actor, clock.now());

          const commit = u.searchParams.get("commit");
          const doCommit = commit == null ? true : commit === "1" || commit === "true";
          const msg = String(body.message ?? `a5c: gate ${issueId} ${needsHuman ? "needs-human" : "clear"}`);
          await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 write: issue blockers (dep.changed)
      {
        const m = /^\/v1\/issues\/([^/]+)\/blockers$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const issueId = decodeURIComponent(m[1]);
          const body = await readJsonObject(req);
          const { actor } = await resolveActorFromClientSig(cfg.repoRoot, req, body);
          const op = String(body.op ?? "") as "add" | "remove";
          if (op !== "add" && op !== "remove") return sendJson(res, 400, { error: "missing op (add|remove)" });
          const byType = String(body.by?.type ?? "");
          const byId = String(body.by?.id ?? "");
          if (byType !== "issue" && byType !== "pr") return sendJson(res, 400, { error: "missing by.type (issue|pr)" });
          if (!byId.trim()) return sendJson(res, 400, { error: "missing by.id" });
          const note = body.note == null ? undefined : String(body.note);

          const repo = await openRepo(cfg.repoRoot);
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const time = new Date().toISOString();
          const wr = await writeDepChanged(
            { repoRoot: repo.root, actor, clock },
            { entity: { type: "issue", id: issueId }, op, by: { type: byType as any, id: byId }, note, time }
          );
          await saveHlcState(actor, clock.now());

          const commit = u.searchParams.get("commit");
          const doCommit = commit == null ? true : commit === "1" || commit === "true";
          const msg = String(body.message ?? `a5c: blocker ${issueId} ${op} ${byType}:${byId}`);
          await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 write: issue claim/release (agent.claim.changed)
      {
        const m = /^\/v1\/issues\/([^/]+)\/claim$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const issueId = decodeURIComponent(m[1]);
          const body = await readJsonObject(req);
          const { actor } = await resolveActorFromClientSig(cfg.repoRoot, req, body);
          const agentId = String(body.agentId ?? actor);
          const op = String(body.op ?? "") as "claim" | "release";
          if (op !== "claim" && op !== "release") return sendJson(res, 400, { error: "missing op (claim|release)" });
          const note = body.note == null ? undefined : String(body.note);

          const repo = await openRepo(cfg.repoRoot);
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const time = new Date().toISOString();
          const wr = await writeAgentClaimChanged(
            { repoRoot: repo.root, actor, clock },
            { agentId, entity: { type: "issue", id: issueId }, op, note, time }
          );
          await saveHlcState(actor, clock.now());

          const commit = u.searchParams.get("commit");
          const doCommit = commit == null ? true : commit === "1" || commit === "true";
          const msg = String(body.message ?? `a5c: claim ${issueId} ${op} ${agentId}`);
          await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });
          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 write: pr claim/release (agent.claim.changed)
      {
        const m = /^\/v1\/prs\/([^/]+)\/claim$/.exec(u.pathname);
        if (req.method === "POST" && m) {
          const prKey = decodeURIComponent(m[1]);
          const body = await readJsonObject(req);
          const { actor } = await resolveActorFromClientSig(cfg.repoRoot, req, body);
          const agentId = String(body.agentId ?? actor);
          const op = String(body.op ?? "") as "claim" | "release";
          if (op !== "claim" && op !== "release") return sendJson(res, 400, { error: "missing op (claim|release)" });
          const note = body.note == null ? undefined : String(body.note);

          const repo = await openRepo(cfg.repoRoot);
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const time = new Date().toISOString();
          const wr = await writeAgentClaimChanged({ repoRoot: repo.root, actor, clock }, { agentId, entity: { type: "pr", id: prKey }, op, note, time });
          await saveHlcState(actor, clock.now());

          const commit = u.searchParams.get("commit");
          const doCommit = commit == null ? true : commit === "1" || commit === "true";
          const msg = String(body.message ?? `a5c: claim ${prKey} ${op} ${agentId}`);
          await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });
          return sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
        }
      }

      // v1 webhooks: GitHub pull_request opened -> inbox PR proposal
      if (req.method === "POST" && u.pathname === "/v1/webhooks/github") {
        const secret = process.env.A5C_GITHUB_WEBHOOK_SECRET;
        const inboxRef = process.env.A5C_GITHUB_INBOX_REF ?? "refs/a5c/inbox/github";
        const raw = await readRaw(req, 512_000);
        if (!verifyGitHubHmac(req, raw, secret)) return sendJson(res, 401, { error: "invalid signature" });
        const evt = String(req.headers["x-github-event"] ?? "");
        const parsed = parseJsonOrEmpty(raw);
        if (evt !== "pull_request") return sendJson(res, 400, { error: "unsupported event" });
        const action = String(parsed?.action ?? "");
        if (action !== "opened") return sendJson(res, 200, { ok: true, ignored: true, reason: `action:${action}` });

        const pr = parsed?.pull_request;
        const sender = parsed?.sender;
        const number = pr?.number;
        const prKey = `pr-gh-${number}`;
        const baseRef = String(pr?.base?.ref ?? "main");
        const headRef = `refs/heads/${String(pr?.head?.ref ?? "unknown")}`;
        const title = String(pr?.title ?? `PR ${number}`);
        const body = pr?.body == null ? undefined : String(pr.body);
        const actor = String(sender?.login ?? "github");
        const time = String(pr?.created_at ?? new Date().toISOString());

        const { result, commit } = await writeToInboxRef(cfg.repoRoot, inboxRef, async (worktreeDir) => {
          const state = await loadHlcState(actor);
          const clock = new HlcClock(state);
          const wr = await writePrProposal({ repoRoot: worktreeDir, actor, clock }, { prKey, baseRef, headRef, title, body, time });
          await saveHlcState(actor, clock.now());
          return wr;
        });

        return sendJson(res, 200, { ok: true, inboxRef, commit, path: (result as any).path });
      }

      // v1 git events: ref update -> git.* webhooks
      if (req.method === "POST" && u.pathname === "/v1/git/ref-updated") {
        const body = await readJsonObject(req, 512_000);
        const ref = String(body.ref ?? "");
        const oldOid = String(body.oldOid ?? "");
        const newOid = String(body.newOid ?? "");
        if (!ref || !newOid) return sendJson(res, 400, { error: "missing ref/newOid" });

        const zero = "0000000000000000000000000000000000000000";
        const range = oldOid && oldOid !== zero ? `${oldOid}..${newOid}` : newOid;

        const commitsRaw = await runGitCapture(["rev-list", range], cfg.repoRoot);
        const commitOids = commitsRaw
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .reverse(); // oldest->newest for stable seq

        // 1) ref updated
        await emitGitWebhook({
          repoRoot: cfg.repoRoot,
          ref,
          seq: 0,
          eventType: "git.ref.updated",
          data: { ref, oldOid: oldOid || zero, newOid, actor: body.actor }
        });

        // 2) commits
        let seq = 1;
        for (const oid of commitOids) {
          const fmt = await runGitCapture(["show", "-s", "--format=%H%n%P%n%an%n%ae%n%at%n%cn%n%ce%n%ct%n%B", oid], cfg.repoRoot);
          const lines = fmt.split(/\r?\n/);
          const commitOid = lines[0]?.trim();
          const parents = (lines[1] ?? "").trim().split(" ").filter(Boolean);
          const author = { name: lines[2] ?? "", email: lines[3] ?? "", time: new Date(Number(lines[4] ?? "0") * 1000).toISOString() };
          const committer = { name: lines[5] ?? "", email: lines[6] ?? "", time: new Date(Number(lines[7] ?? "0") * 1000).toISOString() };
          const message = lines.slice(8).join("\n").trim();

          const nameStatus = await runGitCapture(["show", "--name-status", "--format=", oid], cfg.repoRoot);
          const filesChanged = nameStatus
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
              const parts = l.split("\t");
              const status = parts[0];
              if (status.startsWith("R") || status.startsWith("C")) {
                return { path: parts[2], status: status[0], oldPath: parts[1] };
              }
              return { path: parts[1], status };
            });

          await emitGitWebhook({
            repoRoot: cfg.repoRoot,
            ref,
            seq,
            eventType: "git.commit.created",
            data: { ref, oldOid: oldOid || zero, newOid, commitOid, parents, author, committer, message, filesChanged }
          });
          seq++;
        }

        // 3) tree changed summary
        const diffNs = oldOid && oldOid !== zero ? await runGitCapture(["diff", "--name-status", oldOid, newOid], cfg.repoRoot) : "";
        const diffNum = oldOid && oldOid !== zero ? await runGitCapture(["diff", "--numstat", oldOid, newOid], cfg.repoRoot) : "";
        const filesChanged = diffNs
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const parts = l.split("\t");
            const status = parts[0];
            if (status.startsWith("R") || status.startsWith("C")) return { path: parts[2], status: status[0], oldPath: parts[1] };
            return { path: parts[1], status };
          });
        let additions = 0;
        let deletions = 0;
        for (const l of diffNum.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
          const [a, d] = l.split("\t");
          const aa = Number(a);
          const dd = Number(d);
          if (Number.isFinite(aa)) additions += aa;
          if (Number.isFinite(dd)) deletions += dd;
        }
        await emitGitWebhook({
          repoRoot: cfg.repoRoot,
          ref,
          seq,
          eventType: "git.tree.changed",
          data: { ref, oldOid: oldOid || zero, newOid, stats: { additions, deletions }, filesChanged }
        });

        return sendJson(res, 200, { ok: true, ref, commits: commitOids.length });
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


