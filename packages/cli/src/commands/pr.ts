import type { CommandArgs } from "./types.js";
import { git, gitConfigGet } from "../git.js";
import { syncAfterWrite, syncBeforeWrite } from "../sync.js";
import {
  HlcClock,
  UlidGenerator,
  loadHlcState,
  saveHlcState,
  stageFiles,
  listPRs,
  renderPR,
  writePrProposal,
  writePrRequest,
  writePrEvent
} from "@a5c-ai/sdk";

export async function handlePr(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "pr") return;
  const sub = args.positionals[1];

  if (sub === "list") {
    const keys = listPRs(args.snap);
    if (args.flags.json) args.io.writeLine(args.io.out, JSON.stringify(keys, null, 2));
    else keys.forEach((k) => args.io.writeLine(args.io.out, k));
    return 0;
  }

  if (sub === "show") {
    const key = args.positionals[2];
    if (!key) throw new Error("missing prKey");
    const pr = renderPR(args.snap, key);
    if (!pr) {
      args.io.writeLine(args.io.err, `not found: ${key}`);
      return 2;
    }
    if (args.flags.json) args.io.writeLine(args.io.out, JSON.stringify(pr, null, 2));
    else {
      args.io.writeLine(args.io.out, `${pr.prKey}: ${pr.title}`);
      args.io.writeLine(args.io.out, `base: ${pr.baseRef}`);
      if (pr.headRef) args.io.writeLine(args.io.out, `head: ${pr.headRef}`);
      args.io.writeLine(args.io.out, `events: ${pr.events.length}`);
    }
    return 0;
  }

  if (sub === "propose") {
    const baseRef = args.flags.base;
    const headRef = args.flags.head;
    const title = args.flags.title;
    if (!baseRef || !headRef || !title) {
      args.io.writeLine(args.io.err, "missing --base, --head, or --title");
      return 2;
    }
    if (args.flags.sync && args.flags.commit) {
      await syncBeforeWrite({ repoRoot: args.repoRoot, inboxRefs: args.flags.inboxRefs });
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const prKey = args.flags.id ?? `pr-${new UlidGenerator().generate()}`;
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writePrProposal(ctx, { prKey, baseRef, headRef, title, body: args.flags.body, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: pr propose ${prKey}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
      if (args.flags.sync) await syncAfterWrite({ repoRoot: args.repoRoot });
    }
    args.io.writeLine(args.io.out, prKey);
    return 0;
  }

  if (sub === "request") {
    const baseRef = args.flags.base;
    const title = args.flags.title;
    if (!baseRef || !title) {
      args.io.writeLine(args.io.err, "missing --base or --title");
      return 2;
    }
    if (args.flags.sync && args.flags.commit) {
      await syncBeforeWrite({ repoRoot: args.repoRoot, inboxRefs: args.flags.inboxRefs });
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const prKey = args.flags.id ?? `pr-${new UlidGenerator().generate()}`;
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writePrRequest(ctx, { prKey, baseRef, title, body: args.flags.body, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: pr request ${prKey}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
      if (args.flags.sync) await syncAfterWrite({ repoRoot: args.repoRoot });
    }
    args.io.writeLine(args.io.out, prKey);
    return 0;
  }

  if (sub === "claim") {
    const prKey = args.positionals[2];
    const headRef = args.flags.headRef;
    if (!prKey || !headRef) {
      args.io.writeLine(args.io.err, "missing prKey or --head-ref");
      return 2;
    }
    if (args.flags.sync && args.flags.commit) {
      await syncBeforeWrite({ repoRoot: args.repoRoot, inboxRefs: args.flags.inboxRefs });
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writePrEvent(ctx, { prKey, action: "claim", headRef, message: args.flags.message as any, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: pr claim ${prKey}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
      if (args.flags.sync) await syncAfterWrite({ repoRoot: args.repoRoot });
    }
    args.io.writeLine(args.io.out, res.path);
    return 0;
  }

  if (sub === "bind-head") {
    const prKey = args.positionals[2];
    const headRef = args.flags.headRef;
    if (!prKey || !headRef) {
      args.io.writeLine(args.io.err, "missing prKey or --head-ref");
      return 2;
    }
    if (args.flags.sync && args.flags.commit) {
      await syncBeforeWrite({ repoRoot: args.repoRoot, inboxRefs: args.flags.inboxRefs });
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writePrEvent(ctx, { prKey, action: "bindHead", headRef, message: args.flags.message as any, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: pr bind-head ${prKey}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
      if (args.flags.sync) await syncAfterWrite({ repoRoot: args.repoRoot });
    }
    args.io.writeLine(args.io.out, res.path);
    return 0;
  }

  return;
}


