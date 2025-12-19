import fs from "node:fs/promises";
import path from "node:path";
import { HlcClock } from "./hlc.js";
import { eventFilename, issueEventDir, prEventDir, agentsEventDir, opsEventDir } from "./paths.js";
import type { A5cEventBase } from "../collab/eventTypes.js";

export type WriterContext = {
  repoRoot: string;
  actor: string;
  clock: HlcClock;
  // nonce generator for filename uniqueness within same ms
  nextNonce?: () => string; // must return 4 digits
};

function defaultNonceGen() {
  let n = 0;
  return () => String(++n).padStart(4, "0");
}

async function writeJsonFile(absPath: string, obj: any): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function tsMsFromIso(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO time: ${iso}`);
  return ms;
}

export async function writeIssueCreated(ctx: WriterContext, input: { issueId: string; title: string; body?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "issue.event.created",
    id: `evt_${input.issueId}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { issueId: input.issueId, title: input.title, body: input.body, state: "open" }
  };
  const dir = issueEventDir(input.issueId, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeCommentCreated(ctx: WriterContext, input: { entity: { type: "issue" | "pr"; id: string }; commentId: string; body: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "comment.created",
    id: `evt_${input.entity.type}_${input.entity.id}_${input.commentId}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { entity: input.entity, commentId: input.commentId, body: input.body }
  };
  const dir = input.entity.type === "issue" ? issueEventDir(input.entity.id, input.time) : prEventDir(input.entity.id, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeCommentEdited(ctx: WriterContext, input: { entity: { type: "issue" | "pr"; id: string }; commentId: string; body: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "comment.edited",
    id: `evt_${input.entity.type}_${input.entity.id}_${input.commentId}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { entity: input.entity, commentId: input.commentId, body: input.body }
  };
  const dir = input.entity.type === "issue" ? issueEventDir(input.entity.id, input.time) : prEventDir(input.entity.id, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeCommentRedacted(ctx: WriterContext, input: { entity: { type: "issue" | "pr"; id: string }; commentId: string; reason?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "comment.redacted",
    id: `evt_${input.entity.type}_${input.entity.id}_${input.commentId}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { entity: input.entity, commentId: input.commentId, reason: input.reason }
  };
  const dir = input.entity.type === "issue" ? issueEventDir(input.entity.id, input.time) : prEventDir(input.entity.id, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writePrProposal(ctx: WriterContext, input: { prKey: string; baseRef: string; headRef: string; title: string; body?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "pr.proposal.created",
    id: `evt_${input.prKey}_proposal_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { prKey: input.prKey, baseRef: input.baseRef, headRef: input.headRef, title: input.title, body: input.body }
  };
  const dir = prEventDir(input.prKey, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writePrRequest(ctx: WriterContext, input: { prKey: string; baseRef: string; title: string; body?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "pr.request.created",
    id: `evt_${input.prKey}_request_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { prKey: input.prKey, baseRef: input.baseRef, title: input.title, body: input.body }
  };
  const dir = prEventDir(input.prKey, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writePrEvent(ctx: WriterContext, input: { prKey: string; action: string; headRef?: string; message?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "pr.event.created",
    id: `evt_${input.prKey}_${input.action}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { prKey: input.prKey, action: input.action, headRef: input.headRef, message: input.message }
  };
  const dir = prEventDir(input.prKey, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeAgentHeartbeat(ctx: WriterContext, input: { agentId: string; ttlSeconds: number; status?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "agent.heartbeat.created",
    id: `evt_${input.agentId}_hb_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { agentId: input.agentId, ttlSeconds: input.ttlSeconds, status: input.status }
  };
  const dir = agentsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeAgentClaimChanged(
  ctx: WriterContext,
  input: { agentId: string; entity: { type: "issue" | "pr"; id: string }; op: "claim" | "release"; note?: string; time: string }
) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "agent.claim.changed",
    id: `evt_${input.agentId}_claim_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { agentId: input.agentId, entity: input.entity, op: input.op, note: input.note }
  };
  const dir = agentsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeAgentDispatchCreated(
  ctx: WriterContext,
  input: { dispatchId: string; agentId: string; entity: { type: "issue" | "pr"; id: string }; task?: string; params?: any; time: string }
) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "agent.dispatch.created",
    id: `evt_${input.agentId}_dispatch_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { dispatchId: input.dispatchId, agentId: input.agentId, entity: input.entity, task: input.task, params: input.params }
  };
  const dir = agentsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeAgentAckCreated(ctx: WriterContext, input: { dispatchId: string; agentId: string; message?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "agent.ack.created",
    id: `evt_${input.agentId}_ack_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { dispatchId: input.dispatchId, agentId: input.agentId, message: input.message }
  };
  const dir = agentsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeAgentNackCreated(ctx: WriterContext, input: { dispatchId: string; agentId: string; error: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "agent.nack.created",
    id: `evt_${input.agentId}_nack_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { dispatchId: input.dispatchId, agentId: input.agentId, error: input.error }
  };
  const dir = agentsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeAgentProgressCreated(ctx: WriterContext, input: { dispatchId: string; agentId: string; percent?: number; message?: string; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "agent.progress.created",
    id: `evt_${input.agentId}_progress_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { dispatchId: input.dispatchId, agentId: input.agentId, percent: input.percent, message: input.message }
  };
  const dir = agentsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeDepChanged(
  ctx: WriterContext,
  input: { entity: { type: "issue" | "pr"; id: string }; op: "add" | "remove"; by: { type: "issue" | "pr"; id: string }; note?: string; time: string }
) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "dep.changed",
    id: `evt_dep_${input.entity.type}_${input.entity.id}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { entity: input.entity, op: input.op, by: input.by, note: input.note }
  };
  const dir = input.entity.type === "issue" ? issueEventDir(input.entity.id, input.time) : prEventDir(input.entity.id, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeGateChanged(
  ctx: WriterContext,
  input: { entity: { type: "issue" | "pr"; id: string }; needsHuman: boolean; topic?: string; message?: string; time: string }
) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "gate.changed",
    id: `evt_gate_${input.entity.type}_${input.entity.id}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { entity: input.entity, needsHuman: input.needsHuman, topic: input.topic, message: input.message }
  };
  const dir = input.entity.type === "issue" ? issueEventDir(input.entity.id, input.time) : prEventDir(input.entity.id, input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}

export async function writeOpsBuild(ctx: WriterContext, input: { entity: { type: "issue" | "pr"; id: string }; status?: string; artifact?: any; time: string }) {
  return writeOpsEvent(ctx, { op: "build", entity: input.entity, status: input.status, artifact: input.artifact, time: input.time });
}

export async function writeOpsTest(ctx: WriterContext, input: { entity: { type: "issue" | "pr"; id: string }; status?: string; artifact?: any; time: string }) {
  return writeOpsEvent(ctx, { op: "test", entity: input.entity, status: input.status, artifact: input.artifact, time: input.time });
}

export async function writeOpsDeploy(ctx: WriterContext, input: { entity: { type: "issue" | "pr"; id: string }; status?: string; artifact?: any; time: string }) {
  return writeOpsEvent(ctx, { op: "deploy", entity: input.entity, status: input.status, artifact: input.artifact, time: input.time });
}

export async function writeOpsEvent(ctx: WriterContext, input: { op: string; entity: { type: "issue" | "pr"; id: string }; status?: string; artifact?: any; time: string }) {
  const nonce = (ctx.nextNonce ?? defaultNonceGen())();
  const tsMs = tsMsFromIso(input.time);
  ctx.clock.tick(tsMs);
  const ev: A5cEventBase = {
    schema: "a5cforge/v1",
    kind: "ops.event.created",
    id: `evt_ops_${input.op}_${nonce}`,
    time: input.time,
    actor: ctx.actor,
    payload: { op: input.op, entity: input.entity, status: input.status, artifact: input.artifact }
  };
  const dir = opsEventDir(input.time);
  const filename = eventFilename({ tsMs, actor: ctx.actor, nonce4: nonce, kind: ev.kind, ext: "json" });
  const rel = path.posix.join(dir, filename);
  await writeJsonFile(path.join(ctx.repoRoot, rel), ev);
  return { path: rel, event: ev };
}


