import path from "node:path";
import { eventFilename, issueEventDir, prEventDir } from "./paths.js";
import type { A5cEventBase } from "../collab/eventTypes.js";
import { defaultNonceGen, tsMsFromIso, type WriterContext, writeJsonFile } from "./writerCore.js";

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


