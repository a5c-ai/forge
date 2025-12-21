import type http from "node:http";
import { sendJson } from "../../http/io.js";
import { readJsonObject } from "../../http/json.js";
import { resolveActorFromClientSig } from "../../auth/clientSig.js";
import { maybeCommitAndEmit } from "../../git/commitAndEmit.js";
import {
  HlcClock,
  loadHlcState,
  openRepo,
  saveHlcState,
  writeAgentClaimChanged,
  writeCommentCreated,
  writeDepChanged,
  writeGateChanged,
  writePrProposal,
  writePrRequest
} from "@a5c-ai/sdk";

type Ctx = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  repoRoot: string;
  pathname: string;
  searchParams: URLSearchParams;
};

function commitFlagFromQuery(commitParam: string | null): boolean {
  return commitParam == null ? true : commitParam === "1" || commitParam === "true";
}

async function handleIssueComments({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/issues\/([^/]+)\/comments$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const issueId = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const commentBody = String(body.body ?? "");
  if (!commentBody.trim()) {
    sendJson(res, 400, { error: "missing body" });
    return true;
  }
  const commentId = String(body.commentId ?? `c_${Date.now()}`);

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writeCommentCreated({ repoRoot: repo.root, actor, clock }, { entity: { type: "issue", id: issueId }, commentId, body: commentBody, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: comment ${issueId} ${commentId}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

async function handlePrRequest({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/prs\/([^/]+)\/request$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const prKey = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const baseRef = String(body.baseRef ?? "");
  const title = String(body.title ?? "");
  const prBody = body.body == null ? undefined : String(body.body);
  if (!baseRef.trim()) {
    sendJson(res, 400, { error: "missing baseRef" });
    return true;
  }
  if (!title.trim()) {
    sendJson(res, 400, { error: "missing title" });
    return true;
  }

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writePrRequest({ repoRoot: repo.root, actor, clock }, { prKey, baseRef, title, body: prBody, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: pr request ${prKey}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

async function handlePrProposal({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/prs\/([^/]+)\/proposal$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const prKey = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const baseRef = String(body.baseRef ?? "");
  const headRef = String(body.headRef ?? "");
  const title = String(body.title ?? "");
  const prBody = body.body == null ? undefined : String(body.body);
  if (!baseRef.trim()) {
    sendJson(res, 400, { error: "missing baseRef" });
    return true;
  }
  if (!headRef.trim()) {
    sendJson(res, 400, { error: "missing headRef" });
    return true;
  }
  if (!title.trim()) {
    sendJson(res, 400, { error: "missing title" });
    return true;
  }

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writePrProposal({ repoRoot: repo.root, actor, clock }, { prKey, baseRef, headRef, title, body: prBody, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: pr proposal ${prKey}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

async function handleIssueGate({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/issues\/([^/]+)\/gate$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const issueId = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const needsHuman = Boolean(body.needsHuman);
  const topic = body.topic == null ? undefined : String(body.topic);
  const message = body.message == null ? undefined : String(body.message);

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writeGateChanged({ repoRoot: repo.root, actor, clock }, { entity: { type: "issue", id: issueId }, needsHuman, topic, message, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: gate ${issueId} ${needsHuman ? "needs-human" : "clear"}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

async function handleIssueBlockers({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/issues\/([^/]+)\/blockers$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const issueId = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const op = String(body.op ?? "") as "add" | "remove";
  if (op !== "add" && op !== "remove") {
    sendJson(res, 400, { error: "missing op (add|remove)" });
    return true;
  }
  const byType = String(body.by?.type ?? "");
  const byId = String(body.by?.id ?? "");
  if (byType !== "issue" && byType !== "pr") {
    sendJson(res, 400, { error: "missing by.type (issue|pr)" });
    return true;
  }
  if (!byId.trim()) {
    sendJson(res, 400, { error: "missing by.id" });
    return true;
  }
  const note = body.note == null ? undefined : String(body.note);

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writeDepChanged({ repoRoot: repo.root, actor, clock }, { entity: { type: "issue", id: issueId }, op, by: { type: byType as any, id: byId }, note, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: blocker ${issueId} ${op} ${byType}:${byId}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

async function handleIssueClaim({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/issues\/([^/]+)\/claim$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const issueId = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const agentId = String(body.agentId ?? actor);
  const op = String(body.op ?? "") as "claim" | "release";
  if (op !== "claim" && op !== "release") {
    sendJson(res, 400, { error: "missing op (claim|release)" });
    return true;
  }
  const note = body.note == null ? undefined : String(body.note);

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writeAgentClaimChanged({ repoRoot: repo.root, actor, clock }, { agentId, entity: { type: "issue", id: issueId }, op, note, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: claim ${issueId} ${op} ${agentId}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

async function handlePrClaim({ req, res, repoRoot, pathname, searchParams }: Ctx): Promise<boolean> {
  const m = /^\/v1\/prs\/([^/]+)\/claim$/.exec(pathname);
  if (req.method !== "POST" || !m) return false;

  const prKey = decodeURIComponent(m[1]);
  const body = await readJsonObject(req);
  const { actor } = await resolveActorFromClientSig(repoRoot, req, body);
  const agentId = String(body.agentId ?? actor);
  const op = String(body.op ?? "") as "claim" | "release";
  if (op !== "claim" && op !== "release") {
    sendJson(res, 400, { error: "missing op (claim|release)" });
    return true;
  }
  const note = body.note == null ? undefined : String(body.note);

  const repo = await openRepo(repoRoot);
  const state = await loadHlcState(actor);
  const clock = new HlcClock(state);
  const time = new Date().toISOString();
  const wr = await writeAgentClaimChanged({ repoRoot: repo.root, actor, clock }, { agentId, entity: { type: "pr", id: prKey }, op, note, time });
  await saveHlcState(actor, clock.now());

  const doCommit = commitFlagFromQuery(searchParams.get("commit"));
  const msg = String(body.message ?? `a5c: claim ${prKey} ${op} ${agentId}`);
  await maybeCommitAndEmit({ repoRoot: repo.root, actor, doCommit, message: msg, path: wr.path, event: wr.event });

  sendJson(res, 200, { path: wr.path, event: wr.event, committed: doCommit });
  return true;
}

export async function handleV1Write(args: Ctx): Promise<boolean> {
  const handlers = [
    handleIssueComments,
    handlePrRequest,
    handlePrProposal,
    handleIssueGate,
    handleIssueBlockers,
    handleIssueClaim,
    handlePrClaim
  ];
  for (const h of handlers) {
    if (await h(args)) return true;
  }
  return false;
}


