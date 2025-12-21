import type { CommandArgs } from "./types.js";
import { git, gitConfigGet } from "../git.js";
import {
  HlcClock,
  UlidGenerator,
  loadHlcState,
  saveHlcState,
  stageFiles,
  listIssues,
  renderIssue,
  writeIssueCreated,
  writeCommentCreated,
  writeCommentEdited,
  writeCommentRedacted
} from "@a5c-ai/sdk";

export async function handleIssue(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "issue") return;
  const sub = args.positionals[1];

  if (sub === "list") {
    const ids = listIssues(args.snap);
    if (args.flags.json) args.io.writeLine(args.io.out, JSON.stringify(ids, null, 2));
    else ids.forEach((id) => args.io.writeLine(args.io.out, id));
    return 0;
  }

  if (sub === "show") {
    const id = args.positionals[2];
    if (!id) throw new Error("missing issue id");
    const issue = renderIssue(args.snap, id);
    if (!issue) {
      args.io.writeLine(args.io.err, `not found: ${id}`);
      return 2;
    }
    if (args.flags.json) args.io.writeLine(args.io.out, JSON.stringify(issue, null, 2));
    else {
      args.io.writeLine(args.io.out, `${issue.issueId}: ${issue.title}`);
      if (issue.body) args.io.writeLine(args.io.out, issue.body);
      args.io.writeLine(args.io.out, `comments: ${issue.comments.length}`);
    }
    return 0;
  }

  if (sub === "new") {
    const title = args.flags.title;
    if (!title) {
      args.io.writeLine(args.io.err, "missing --title");
      return 2;
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const issueId = args.flags.id ?? `issue-${new UlidGenerator().generate()}`;
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writeIssueCreated(ctx, { issueId, title, body: args.flags.body, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: issue new ${issueId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
    }
    args.io.writeLine(args.io.out, issueId);
    return 0;
  }

  if (sub === "comment") {
    const id = args.positionals[2];
    const body = args.flags.message ?? args.flags.body;
    if (!id || !body) {
      args.io.writeLine(args.io.err, "usage: git a5c issue comment <id> -m <text>");
      return 2;
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const commentId = args.flags.commentId ?? `c-${new UlidGenerator().generate()}`;
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writeCommentCreated(ctx, { entity: { type: "issue", id }, commentId, body: String(body), time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: issue comment ${id}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
    }
    args.io.writeLine(args.io.out, commentId);
    return 0;
  }

  if (sub === "edit-comment") {
    const commentId = args.positionals[2] ?? args.flags.commentId;
    const body = args.flags.message ?? args.flags.body;
    const id = args.flags.id; // entity id required for now
    if (!commentId || !body || !id) {
      args.io.writeLine(args.io.err, "usage: git a5c issue edit-comment <commentId> --id <issueId> -m <text>");
      return 2;
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writeCommentEdited(ctx, { entity: { type: "issue", id }, commentId, body: String(body), time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: issue edit-comment ${id} ${commentId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
    }
    args.io.writeLine(args.io.out, res.path);
    return 0;
  }

  if (sub === "redact-comment") {
    const commentId = args.positionals[2] ?? args.flags.commentId;
    const id = args.flags.id;
    if (!commentId || !id) {
      args.io.writeLine(args.io.err, "usage: git a5c issue redact-comment <commentId> --id <issueId> [--reason ...]");
      return 2;
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(args.repoRoot, "user.name")) ?? "unknown";
    const time = new Date(args.nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot: args.repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writeCommentRedacted(ctx, { entity: { type: "issue", id }, commentId, reason: args.flags.reason, time });
    await saveHlcState(actor, clock.now());
    if (args.flags.stageOnly || args.flags.commit) await stageFiles(args.repoRoot, [res.path]);
    if (args.flags.commit) {
      const msg = args.flags.message ?? `a5c: issue redact-comment ${id} ${commentId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], args.repoRoot);
    }
    args.io.writeLine(args.io.out, res.path);
    return 0;
  }

  return;
}


