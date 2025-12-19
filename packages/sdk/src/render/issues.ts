import type { Snapshot } from "../collab/loadSnapshot.js";
import type { A5cEventBase } from "../collab/eventTypes.js";

export type RenderedComment = {
  commentId: string;
  author: string;
  createdAt: string;
  body?: string;
  redacted?: boolean;
  redactedReason?: string;
  edits: { time: string; actor: string; body: string }[];
};

export type RenderedIssue = {
  issueId: string;
  title: string;
  body?: string;
  state: "open" | "closed";
  createdAt: string;
  createdBy: string;
  needsHuman?: { topic?: string; message?: string };
  blockers?: { by: { type: "issue" | "pr"; id: string }; note?: string }[];
  comments: RenderedComment[];
};

function isIssueEvent(e: A5cEventBase): boolean {
  return e.kind === "issue.event.created";
}

function isCommentEvent(e: A5cEventBase): boolean {
  return e.kind === "comment.created" || e.kind === "comment.edited" || e.kind === "comment.redacted";
}

function commentEntityKey(ev: any): string | undefined {
  const entity = ev?.payload?.entity;
  if (!entity) return;
  if (entity.type === "issue") return entity.id;
  return;
}

export function listIssues(snapshot: Snapshot): string[] {
  const ids = new Set<string>();
  for (const ef of snapshot.collabEvents) {
    const e = ef.event;
    if (isIssueEvent(e)) ids.add((e as any).payload.issueId);
  }
  return [...ids].sort();
}

export function renderIssue(snapshot: Snapshot, issueId: string): RenderedIssue | undefined {
  let created: A5cEventBase | undefined;
  const comments = new Map<string, RenderedComment>();
  const blockers = new Map<string, { by: { type: "issue" | "pr"; id: string }; note?: string }>();
  let needsHuman: RenderedIssue["needsHuman"];

  for (const ef of snapshot.collabEvents) {
    const e = ef.event;
    if (isIssueEvent(e) && (e as any).payload.issueId === issueId) {
      // First create wins in this baseline (should be deterministic given ordering).
      created ??= e;
      continue;
    }

    if (e.kind === "dep.changed") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "issue" && ent?.id === issueId) {
        const by = (e as any).payload.by;
        const op = (e as any).payload.op;
        const key = `${by?.type}:${by?.id}`;
        if (op === "add") blockers.set(key, { by, note: (e as any).payload.note });
        if (op === "remove") blockers.delete(key);
      }
    }
    if (e.kind === "gate.changed") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "issue" && ent?.id === issueId) {
        const nh = Boolean((e as any).payload.needsHuman);
        if (nh) needsHuman = { topic: (e as any).payload.topic, message: (e as any).payload.message };
        else needsHuman = undefined;
      }
    }

    if (!isCommentEvent(e)) continue;
    const entityIssueId = commentEntityKey(e);
    if (entityIssueId !== issueId) continue;

    const commentId = (e as any).payload.commentId as string;
    if (!commentId) continue;

    if (e.kind === "comment.created") {
      if (!comments.has(commentId)) {
        comments.set(commentId, {
          commentId,
          author: e.actor,
          createdAt: e.time,
          body: (e as any).payload.body,
          edits: []
        });
      }
    } else if (e.kind === "comment.edited") {
      const c =
        comments.get(commentId) ??
        ({
          commentId,
          author: e.actor,
          createdAt: e.time,
          edits: []
        } as RenderedComment);
      c.edits.push({ time: e.time, actor: e.actor, body: (e as any).payload.body });
      c.body = (e as any).payload.body;
      comments.set(commentId, c);
    } else if (e.kind === "comment.redacted") {
      const c =
        comments.get(commentId) ??
        ({
          commentId,
          author: e.actor,
          createdAt: e.time,
          edits: []
        } as RenderedComment);
      c.redacted = true;
      c.redactedReason = (e as any).payload.reason;
      c.body = undefined;
      comments.set(commentId, c);
    }
  }

  if (!created) return;

  const rendered: RenderedIssue = {
    issueId,
    title: (created as any).payload.title,
    body: (created as any).payload.body,
    state: ((created as any).payload.state ?? "open") as any,
    createdAt: created.time,
    createdBy: created.actor,
    needsHuman,
    blockers: blockers.size > 0 ? [...blockers.values()] : undefined,
    comments: [...comments.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  };
  return rendered;
}


