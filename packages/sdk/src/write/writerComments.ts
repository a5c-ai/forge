import path from "node:path";
import { eventFilename, issueEventDir, prEventDir } from "./paths.js";
import type { A5cEventBase } from "../collab/eventTypes.js";
import { defaultNonceGen, tsMsFromIso, type WriterContext, writeJsonFile } from "./writerCore.js";

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


