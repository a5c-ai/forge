import type { CommandArgs } from "./types.js";
import { git, gitConfigGet } from "../git.js";
import { HlcClock, loadHlcState, saveHlcState, stageFiles, writeDepChanged } from "@a5cforge/sdk";

export async function handleBlock(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "block") return;
  // git a5c block <entityId> --by <issueOrPrId> [--op add|remove]
  const entityId = args.positionals[1];
  const byId = args.flags.by;
  const op = (args.flags.op as any) ?? "add";
  if (!entityId || !byId) {
    args.io.writeLine(args.io.err, "usage: git a5c block <entityId> --by <issue|pr> [--op add|remove]");
    return 2;
  }
  const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
  const by = { type: byId.startsWith("pr-") ? "pr" : "issue", id: byId } as const;
  const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
  const time = new Date(args.nowMs()).toISOString();
  const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
  const clock = new HlcClock(persisted);
  let nonce = 0;
  const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
  const res = await writeDepChanged(ctx, { entity, op, by, note: args.flags.message as any, time });
  await saveHlcState(actor, clock.now());
  if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
  if (args.flags.commit) {
    const msg = args.flags.message ?? `a5c: dep ${op} ${entityId}`;
    await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
  }
  args.io.writeLine(args.io.out, res.path);
  return 0;
}


