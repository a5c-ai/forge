import type { CommandArgs } from "./types.js";
import { git, gitConfigGet } from "../git.js";
import { HlcClock, loadHlcState, saveHlcState, stageFiles, writeGateChanged } from "@a5cforge/sdk";

export async function handleGate(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "gate") return;
  const sub = args.positionals[1];
  const entityId = args.positionals[2];
  if (!sub || !entityId) {
    args.io.writeLine(args.io.err, "usage: git a5c gate needs-human|clear <entityId> [--topic t] [-m msg]");
    return 2;
  }
  const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
  const needsHuman = sub === "needs-human";
  const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
  const time = new Date(args.nowMs()).toISOString();
  const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
  const clock = new HlcClock(persisted);
  let nonce = 0;
  const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
  const res = await writeGateChanged(ctx, { entity, needsHuman, topic: args.flags.topic, message: args.flags.message as any, time });
  await saveHlcState(actor, clock.now());
  if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
  if (args.flags.commit) {
    const msg = args.flags.message ?? `a5c: gate ${sub} ${entityId}`;
    await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
  }
  args.io.writeLine(args.io.out, res.path);
  return 0;
}


