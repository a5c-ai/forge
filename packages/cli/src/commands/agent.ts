import type { CommandArgs } from "./types.js";
import { git, gitConfigGet } from "../git.js";
import { syncAfterWrite, syncBeforeWrite } from "../sync.js";
import {
  HlcClock,
  UlidGenerator,
  loadHlcState,
  saveHlcState,
  stageFiles,
  writeAgentHeartbeat,
  writeAgentDispatchCreated
} from "@a5c-ai/sdk";
import { handleAgentRun } from "./agentRun.js";
import { handleAgentGenerateContext } from "./agentGenerateContext.js";

export async function handleAgent(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "agent") return;
  const runRes = await handleAgentRun(args);
  if (runRes !== undefined) return runRes;
  const genRes = await handleAgentGenerateContext(args);
  if (genRes !== undefined) return genRes;
  const sub = args.positionals[1];
  const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
  const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
  const clock = new HlcClock(persisted);
  let nonce = 0;
  const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };

  if (sub === "heartbeat") {
    const agentId = args.flags.agentId ?? actor;
    const ttlSeconds = args.flags.ttlSeconds ?? 120;
    const time = new Date(args.nowMs()).toISOString();
    const status = args.flags.message ?? undefined;
    const entityId = args.flags.entity;
    const entity = entityId ? ({ type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const) : undefined;
    if (args.flags.sync && args.flags.commit) {
      await syncBeforeWrite({ repoRoot: args.repoRoot, inboxRefs: args.flags.inboxRefs });
    }
    const res = await writeAgentHeartbeat(ctx, { agentId, ttlSeconds, status, entity, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: agent heartbeat ${agentId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
      if (args.flags.sync) await syncAfterWrite({ repoRoot: args.repoRoot });
    }
    args.io.writeLine(args.io.out, res.path);
    return 0;
  }

  if (sub === "dispatch") {
    const entityId = args.flags.entity;
    if (!entityId) {
      args.io.writeLine(args.io.err, "usage: git a5c agent dispatch --entity <issueId|prKey> [--dispatch-id ...] [--task ...]");
      return 2;
    }
    if (args.flags.sync && args.flags.commit) {
      await syncBeforeWrite({ repoRoot: args.repoRoot, inboxRefs: args.flags.inboxRefs });
    }
    const dispatchId = args.flags.dispatchId ?? `d-${new UlidGenerator().generate()}`;
    const time = new Date(args.nowMs()).toISOString();
    const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
    const agentId = args.flags.agentId ?? actor;
    const res = await writeAgentDispatchCreated(ctx, {
      dispatchId,
      agentId,
      entity,
      task: args.flags.task,
      params: undefined,
      time
    });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: agent dispatch ${dispatchId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
      if (args.flags.sync) await syncAfterWrite({ repoRoot: args.repoRoot });
    }
    args.io.writeLine(args.io.out, res.path);
    return 0;
  }

  args.io.writeLine(args.io.err, "usage: git a5c agent heartbeat|dispatch ...");
  return 2;
}
