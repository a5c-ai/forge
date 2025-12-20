import path from "node:path";
import { eventFilename, agentsEventDir } from "./paths.js";
import type { A5cEventBase } from "../collab/eventTypes.js";
import { defaultNonceGen, tsMsFromIso, type WriterContext, writeJsonFile } from "./writerCore.js";

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


