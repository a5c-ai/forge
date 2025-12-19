import { detectRepoRoot, git, gitConfigGet, gitPath } from "./git.js";
import fs from "node:fs/promises";
import { parseArgs } from "./args.js";
import { parseSinceToEpochMs } from "./time.js";
import {
  HlcClock,
  UlidGenerator,
  loadHlcState,
  saveHlcState,
  loadSnapshot,
  openRepo,
  stageFiles,
  listIssues,
  listPRs,
  renderIssue,
  renderPR,
  verify,
  writeIssueCreated,
  writeCommentCreated,
  writeCommentEdited,
  writeCommentRedacted,
  writePrProposal,
  writePrRequest,
  writePrEvent,
  writeDepChanged,
  writeGateChanged,
  writeAgentHeartbeat,
  writeAgentDispatchCreated,
  writeOpsBuild,
  writeOpsTest,
  writeOpsDeploy
} from "@a5cforge/sdk";

export type RunOptions = {
  cwd?: string;
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
};

function writeLine(write: (s: string) => void, s = "") {
  write(s + "\n");
}

function nowMs(): number {
  // Test hook for deterministic journal/active: set A5C_NOW_ISO=...
  const iso = process.env.A5C_NOW_ISO;
  if (iso) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function typeMatches(kind: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((p) => (p.endsWith(".*") ? kind.startsWith(p.slice(0, -2)) : kind === p));
}

function entityMatches(ev: any, entity: string | undefined): boolean {
  if (!entity) return true;
  // entity can be issueId or prKey (we treat prKey as starting with "pr-" by convention, but don't require it).
  const kind = ev.kind as string;
  const payload = ev.payload ?? {};

  if (kind === "issue.event.created") return payload.issueId === entity;
  if (kind.startsWith("comment.")) return payload.entity?.id === entity;
  if (kind.startsWith("pr.")) return payload.prKey === entity;
  if (kind === "dep.changed" || kind === "gate.changed") return payload.entity?.id === entity;
  if (kind.startsWith("agent.")) return payload.entity?.id === entity;
  if (kind.startsWith("ops.")) return payload.entity?.id === entity;
  return false;
}

export async function runCli(argv: string[], opts: RunOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const out = opts.stdout ?? ((s) => process.stdout.write(s));
  const err = opts.stderr ?? ((s) => process.stderr.write(s));

  const { flags, positionals } = parseArgs(argv);
  const cmd = positionals[0] ?? "help";

  let repoRoot: string;
  try {
    repoRoot = typeof flags.repo === "string" ? flags.repo : await detectRepoRoot(cwd);
  } catch (e: any) {
    writeLine(err, "not a git repository (use --repo <path>)");
    return 2;
  }
  const treeish = typeof flags.treeish === "string" ? flags.treeish : "HEAD";

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    writeLine(out, "git a5c <command> [--json] [--treeish <ref>] [--repo <path>] [--inbox-ref <ref>...]");
    writeLine(out, "");
    writeLine(out, "Commands:");
    writeLine(out, "  status");
    writeLine(out, "  issue list");
    writeLine(out, "  issue show <id>");
    writeLine(out, "  issue new --title <t> [--body <b>] [--stage-only|--commit]");
    writeLine(out, "  issue comment <id> -m <text> [--comment-id <id>] [--stage-only|--commit]");
    writeLine(out, "  issue edit-comment <commentId> --id <issueId> -m <text> [--stage-only|--commit]");
    writeLine(out, "  issue redact-comment <commentId> --id <issueId> [--reason <r>] [--stage-only|--commit]");
    writeLine(out, "  pr list");
    writeLine(out, "  pr show <prKey>");
    writeLine(out, "  pr propose --base <ref> --head <ref> --title <t> [--body <b>] [--stage-only|--commit]");
    writeLine(out, "  pr request --base <ref> --title <t> [--body <b>] [--stage-only|--commit]");
    writeLine(out, "  pr claim <prKey> --head-ref <ref> [-m <msg>] [--stage-only|--commit]");
    writeLine(out, "  pr bind-head <prKey> --head-ref <ref> [-m <msg>] [--stage-only|--commit]");
    writeLine(out, "  block <entityId> --by <issue|pr> [--op add|remove] [-m <note>] [--stage-only|--commit]");
    writeLine(out, "  gate needs-human <entityId> [--topic <t>] [-m <msg>] [--stage-only|--commit]");
    writeLine(out, "  gate clear <entityId> [-m <msg>] [--stage-only|--commit]");
    writeLine(out, "  agent heartbeat [--agent-id <id>] [--ttl-seconds N] [-m <status>] [--stage-only|--commit]");
    writeLine(out, "  ops deploy --entity <id> [--artifact <uri>] [-m <status>] [--stage-only|--commit]");
    writeLine(out, "  verify");
    writeLine(out, "  journal [--since <2h|2025-...>] [--limit N] [--types a,b] [--entity <id>] [--active]");
    writeLine(out, "  hooks install|uninstall");
    return 0;
  }

  const repo = await openRepo(repoRoot);
  const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs: flags.inboxRefs });

  if (cmd === "status") {
    const issues = listIssues(snap).length;
    const prs = listPRs(snap).length;
    if (flags.json) {
      writeLine(out, JSON.stringify({ treeish, issues, prs }, null, 2));
    } else {
      writeLine(out, `treeish: ${treeish}`);
      writeLine(out, `issues: ${issues}`);
      writeLine(out, `prs: ${prs}`);
    }
    return 0;
  }

  if (cmd === "issue") {
    const sub = positionals[1];
    if (sub === "list") {
      const ids = listIssues(snap);
      if (flags.json) writeLine(out, JSON.stringify(ids, null, 2));
      else ids.forEach((id) => writeLine(out, id));
      return 0;
    }
    if (sub === "show") {
      const id = positionals[2];
      if (!id) throw new Error("missing issue id");
      const issue = renderIssue(snap, id);
      if (!issue) {
        writeLine(err, `not found: ${id}`);
        return 2;
      }
      if (flags.json) writeLine(out, JSON.stringify(issue, null, 2));
      else {
        writeLine(out, `${issue.issueId}: ${issue.title}`);
        if (issue.body) writeLine(out, issue.body);
        writeLine(out, `comments: ${issue.comments.length}`);
      }
      return 0;
    }

    if (sub === "new") {
      const title = flags.title;
      if (!title) {
        writeLine(err, "missing --title");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const issueId = flags.id ?? `issue-${new UlidGenerator().generate()}`;
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writeIssueCreated(ctx, { issueId, title, body: flags.body, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: issue new ${issueId}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, issueId);
      return 0;
    }

    if (sub === "comment") {
      const id = positionals[2];
      const body = flags.message ?? flags.body;
      if (!id || !body) {
        writeLine(err, "usage: git a5c issue comment <id> -m <text>");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const commentId = flags.commentId ?? `c-${new UlidGenerator().generate()}`;
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writeCommentCreated(ctx, { entity: { type: "issue", id }, commentId, body: String(body), time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: issue comment ${id}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, commentId);
      return 0;
    }

    if (sub === "edit-comment") {
      const commentId = positionals[2] ?? flags.commentId;
      const body = flags.message ?? flags.body;
      const id = flags.id; // entity id required for now
      if (!commentId || !body || !id) {
        writeLine(err, "usage: git a5c issue edit-comment <commentId> --id <issueId> -m <text>");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writeCommentEdited(ctx, { entity: { type: "issue", id }, commentId, body: String(body), time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: issue edit-comment ${id} ${commentId}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, res.path);
      return 0;
    }

    if (sub === "redact-comment") {
      const commentId = positionals[2] ?? flags.commentId;
      const id = flags.id;
      if (!commentId || !id) {
        writeLine(err, "usage: git a5c issue redact-comment <commentId> --id <issueId> [--reason ...]");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writeCommentRedacted(ctx, { entity: { type: "issue", id }, commentId, reason: flags.reason, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: issue redact-comment ${id} ${commentId}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, res.path);
      return 0;
    }
  }

  if (cmd === "pr") {
    const sub = positionals[1];
    if (sub === "list") {
      const keys = listPRs(snap);
      if (flags.json) writeLine(out, JSON.stringify(keys, null, 2));
      else keys.forEach((k) => writeLine(out, k));
      return 0;
    }
    if (sub === "show") {
      const key = positionals[2];
      if (!key) throw new Error("missing prKey");
      const pr = renderPR(snap, key);
      if (!pr) {
        writeLine(err, `not found: ${key}`);
        return 2;
      }
      if (flags.json) writeLine(out, JSON.stringify(pr, null, 2));
      else {
        writeLine(out, `${pr.prKey}: ${pr.title}`);
        writeLine(out, `base: ${pr.baseRef}`);
        if (pr.headRef) writeLine(out, `head: ${pr.headRef}`);
        writeLine(out, `events: ${pr.events.length}`);
      }
      return 0;
    }

    if (sub === "propose") {
      const baseRef = flags.base;
      const headRef = flags.head;
      const title = flags.title;
      if (!baseRef || !headRef || !title) {
        writeLine(err, "missing --base, --head, or --title");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const prKey = flags.id ?? `pr-${new UlidGenerator().generate()}`;
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writePrProposal(ctx, { prKey, baseRef, headRef, title, body: flags.body, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: pr propose ${prKey}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, prKey);
      return 0;
    }

    if (sub === "request") {
      const baseRef = flags.base;
      const title = flags.title;
      if (!baseRef || !title) {
        writeLine(err, "missing --base or --title");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const prKey = flags.id ?? `pr-${new UlidGenerator().generate()}`;
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writePrRequest(ctx, { prKey, baseRef, title, body: flags.body, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: pr request ${prKey}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, prKey);
      return 0;
    }

    if (sub === "claim") {
      const prKey = positionals[2];
      const headRef = flags.headRef;
      if (!prKey || !headRef) {
        writeLine(err, "missing prKey or --head-ref");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writePrEvent(ctx, { prKey, action: "claim", headRef, message: flags.message as any, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: pr claim ${prKey}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, res.path);
      return 0;
    }

    if (sub === "bind-head") {
      const prKey = positionals[2];
      const headRef = flags.headRef;
      if (!prKey || !headRef) {
        writeLine(err, "missing prKey or --head-ref");
        return 2;
      }
      const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
      const time = new Date(nowMs()).toISOString();
      const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
      const clock = new HlcClock(persisted);
      let nonce = 0;
      const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
      const res = await writePrEvent(ctx, { prKey, action: "bindHead", headRef, message: flags.message as any, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: pr bind-head ${prKey}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, res.path);
      return 0;
    }
  }

  if (cmd === "block") {
    // git a5c block <entityId> --by <issueOrPrId> [--op add|remove]
    const entityId = positionals[1];
    const byId = flags.by;
    const op = (flags.op as any) ?? "add";
    if (!entityId || !byId) {
      writeLine(err, "usage: git a5c block <entityId> --by <issue|pr> [--op add|remove]");
      return 2;
    }
    const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
    const by = { type: byId.startsWith("pr-") ? "pr" : "issue", id: byId } as const;
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
    const time = new Date(nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writeDepChanged(ctx, { entity, op, by, note: flags.message as any, time });
    await saveHlcState(actor, clock.now());
    if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
    if (flags.commit) {
      const msg = flags.message ?? `a5c: dep ${op} ${entityId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
    }
    writeLine(out, res.path);
    return 0;
  }

  if (cmd === "gate") {
    const sub = positionals[1];
    const entityId = positionals[2];
    if (!sub || !entityId) {
      writeLine(err, "usage: git a5c gate needs-human|clear <entityId> [--topic t] [-m msg]");
      return 2;
    }
    const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
    const needsHuman = sub === "needs-human";
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
    const time = new Date(nowMs()).toISOString();
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const res = await writeGateChanged(ctx, { entity, needsHuman, topic: flags.topic, message: flags.message as any, time });
    await saveHlcState(actor, clock.now());
    if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
    if (flags.commit) {
      const msg = flags.message ?? `a5c: gate ${sub} ${entityId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
    }
    writeLine(out, res.path);
    return 0;
  }

  if (cmd === "agent") {
    const sub = positionals[1];
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const time = new Date(nowMs()).toISOString();

    if (sub === "heartbeat") {
      const agentId = flags.agentId ?? actor;
      const ttlSeconds = flags.ttlSeconds ?? 300;
      const res = await writeAgentHeartbeat(ctx, { agentId, ttlSeconds, status: flags.message as any, time });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: agent heartbeat ${agentId}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, res.path);
      return 0;
    }

    if (sub === "dispatch") {
      const dispatchId = flags.dispatchId ?? `d-${new UlidGenerator().generate()}`;
      const entityId = flags.entity;
      if (!entityId) {
        writeLine(err, "usage: git a5c agent dispatch --entity <issueId|prKey> [--dispatch-id ...] [--task ...]");
        return 2;
      }
      const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
      const agentId = flags.agentId ?? actor;
      const res = await writeAgentDispatchCreated(ctx, {
        dispatchId,
        agentId,
        entity,
        task: flags.task,
        params: undefined,
        time
      });
      await saveHlcState(actor, clock.now());
      if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
      if (flags.commit) {
        const msg = flags.message ?? `a5c: agent dispatch ${dispatchId}`;
        await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
      }
      writeLine(out, res.path);
      return 0;
    }

    writeLine(err, "usage: git a5c agent heartbeat|dispatch ...");
    return 2;
  }

  if (cmd === "ops") {
    const sub = positionals[1];
    if (sub !== "deploy" && sub !== "build" && sub !== "test") {
      writeLine(err, "usage: git a5c ops deploy|build|test --entity <id> [--artifact ...] [--rev ...] [--env ...]");
      return 2;
    }
    const entityId = flags.entity;
    if (!entityId) {
      writeLine(err, "missing --entity");
      return 2;
    }
    const actor = process.env.A5C_ACTOR ?? (await gitConfigGet(repoRoot, "user.name")) ?? "unknown";
    const persisted = (await loadHlcState(actor)) ?? { wallMs: 0, counter: 0 };
    const clock = new HlcClock(persisted);
    let nonce = 0;
    const ctx = { repoRoot, actor, clock, nextNonce: () => String(++nonce).padStart(4, "0") };
    const time = new Date(nowMs()).toISOString();
    const entity = { type: entityId.startsWith("pr-") ? "pr" : "issue", id: entityId } as const;
    const artifact = flags.artifact ? { name: flags.artifact, uri: flags.artifact } : undefined;
    const res =
      sub === "build"
        ? await writeOpsBuild(ctx, { entity, status: flags.message as any, artifact, time })
        : sub === "test"
          ? await writeOpsTest(ctx, { entity, status: flags.message as any, artifact, time })
          : await writeOpsDeploy(ctx, { entity, status: flags.message as any, artifact, time });
    await saveHlcState(actor, clock.now());
    if (flags.stageOnly || flags.commit) await stageFiles(repoRoot, [res.path]);
    if (flags.commit) {
      const msg = flags.message ?? `a5c: ops ${sub} ${entityId}`;
      await git(["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "-m", msg], repoRoot);
    }
    writeLine(out, res.path);
    return 0;
  }

  if (cmd === "hooks") {
    const sub = positionals[1];
    if (sub !== "install" && sub !== "uninstall") {
      writeLine(err, "usage: git a5c hooks install|uninstall");
      return 2;
    }
    const hooksDir = await gitPath(repoRoot, "hooks");
    const hookFiles = ["post-commit", "post-merge"];
    if (sub === "uninstall") {
      for (const f of hookFiles) {
        try {
          const p = `${hooksDir}/${f}`;
          const cur = await fs.readFile(p, "utf8");
          if (cur.includes("A5C-HOOK-MANAGED: yes")) {
            await fs.unlink(p);
          }
        } catch {}
      }
      writeLine(out, "ok");
      return 0;
    }
    const script = `#!/bin/sh\n# a5cforge hook (generated)\n# A5C-HOOK-MANAGED: yes\n# Keep it quiet; write last journal to .git\nif command -v git >/dev/null 2>&1; then\n  git a5c journal --since 2h --limit 20 --json > \"$(git rev-parse --git-path a5c-last-journal.json)\" 2>/dev/null || true\nfi\nexit 0\n`;
    await fs.mkdir(hooksDir, { recursive: true });
    for (const f of hookFiles) {
      const p = `${hooksDir}/${f}`;
      await fs.writeFile(p, script, "utf8");
      try {
        await fs.chmod(p, 0o755);
      } catch {}
    }
    writeLine(out, "ok");
    return 0;
  }

  if (cmd === "verify") {
    const v = verify(snap);
    if (flags.json) {
      writeLine(out, JSON.stringify(v, null, 2));
    } else {
      const counts = v.reduce<Record<string, number>>((acc, x) => {
        acc[x.status] = (acc[x.status] ?? 0) + 1;
        return acc;
      }, {});
      writeLine(out, `events: ${v.length}`);
      for (const k of Object.keys(counts).sort()) writeLine(out, `${k}: ${counts[k]}`);
    }
    return 0;
  }

  if (cmd === "journal") {
    const limit = Number.isFinite(flags.limit as any) ? (flags.limit as number) : 20;
    const sinceMs = flags.since ? parseSinceToEpochMs(flags.since, nowMs()) : undefined;
    const events = [...snap.collabEvents, ...(snap.inbox?.events ?? [])]
      .map((e) => ({
        time: (e.event as any).time as string,
        actor: (e.event as any).actor as string,
        kind: e.kind,
        id: (e.event as any).id as string,
        payload: (e.event as any).payload as any
      }))
      .filter((e) => typeMatches(e.kind, flags.types))
      .filter((e) => entityMatches({ kind: e.kind, payload: e.payload }, flags.entity))
      .filter((e) => {
        if (!sinceMs) return true;
        const t = Date.parse(e.time);
        return Number.isFinite(t) && t >= sinceMs;
      })
      .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.id < b.id ? 1 : -1))
      .slice(0, limit);

    if (flags.json) {
      const base = events.map(({ payload: _p, ...rest }) => rest);
      if (!flags.active) {
        writeLine(out, JSON.stringify(base, null, 2));
        return 0;
      }
      // active = derive active agents from latest heartbeat per agentId
      const now = nowMs();
      const latest = new Map<string, any>();
      for (const e of [...snap.collabEvents]) {
        if (e.kind !== "agent.heartbeat.created") continue;
        const ev = e.event as any;
        const agentId = ev.payload?.agentId;
        if (!agentId) continue;
        const t = Date.parse(ev.time);
        if (!Number.isFinite(t)) continue;
        const prev = latest.get(agentId);
        if (!prev || Date.parse(prev.time) < t) latest.set(agentId, { time: ev.time, actor: ev.actor, agentId, ttlSeconds: ev.payload?.ttlSeconds, entity: ev.payload?.entity, status: ev.payload?.status });
      }
      const activeAgents = [...latest.values()].filter((hb) => {
        const t = Date.parse(hb.time);
        const ttlMs = (hb.ttlSeconds ?? 0) * 1000;
        return ttlMs > 0 && now - t <= ttlMs;
      });
      writeLine(out, JSON.stringify({ events: base, activeAgents }, null, 2));
      return 0;
    } else {
      events.forEach((e) => writeLine(out, `${e.time} ${e.actor} ${e.kind} ${e.id}`));
      return 0;
    }
  }

  writeLine(err, `unknown command: ${cmd}`);
  return 2;
}


