import path from "node:path";
import { eventFilename, prEventDir } from "./paths.js";
import type { A5cEventBase } from "../collab/eventTypes.js";
import { defaultNonceGen, tsMsFromIso, type WriterContext, writeJsonFile } from "./writerCore.js";

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


