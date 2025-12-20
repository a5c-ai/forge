import path from "node:path";
import { eventFilename, opsEventDir } from "./paths.js";
import type { A5cEventBase } from "../collab/eventTypes.js";
import { defaultNonceGen, tsMsFromIso, type WriterContext, writeJsonFile } from "./writerCore.js";

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


