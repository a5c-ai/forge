import type { CommandArgs } from "./types.js";
import { git, gitConfigGet } from "../git.js";
import { HlcClock, loadHlcState, saveHlcState, stageFiles, writeOpsBuild, writeOpsDeploy, writeOpsTest } from "@a5cforge/sdk";

export async function handleOps(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "ops") return;
  const sub = args.positionals[1];
  if (sub !== "deploy" && sub !== "build" && sub !== "test") {
    args.io.writeLine(args.io.err, "usage: git a5c ops deploy|build|test --entity <id> [--artifact ...] [--rev ...] [--env ...]");
    return 2;
  }
  const entityId = args.flags.entity;
  if (!entityId) {
    args.io.writeLine(args.io.err, "missing --entity");
    return 2;
  }
  const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
  const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
  const clock = new HlcClock(persisted);
  let nonce = 0;
  const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
  const time = new Date(args.nowMs()).toISOString();
  const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
  const artifact = args.flags.artifact ? { name: args.flags.artifact, uri: args.flags.artifact } : undefined;
  const res =
    sub === "build"
      ? await writeOpsBuild(ctx, { entity, status: args.flags.message as any, artifact, time })
      : sub === "test"
        ? await writeOpsTest(ctx, { entity, status: args.flags.message as any, artifact, time })
        : await writeOpsDeploy(ctx, { entity, status: args.flags.message as any, artifact, time });
  await saveHlcState(actor, clock.now());
  if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
  if (args.flags.commit) {
    const msg = args.flags.message ?? `a5c: ops ${sub} ${entityId}`;
    await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
  }
  args.io.writeLine(args.io.out, res.path);
  return 0;
}


