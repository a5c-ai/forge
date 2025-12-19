import type { Snapshot } from "../collab/loadSnapshot.js";
import type { A5cEventBase } from "../collab/eventTypes.js";

export type RenderedPR = {
  prKey: string;
  title: string;
  body?: string;
  baseRef: string;
  headRef?: string;
  kind: "proposal" | "request";
  createdAt: string;
  createdBy: string;
  inboxProposals?: { actor: string; time: string; headRef: string; title: string }[];
  events: { time: string; actor: string; action: string; message?: string; headRef?: string }[];
};

function isPRRootEvent(e: A5cEventBase): boolean {
  return e.kind === "pr.proposal.created" || e.kind === "pr.request.created";
}

function isPREvent(e: A5cEventBase): boolean {
  return e.kind === "pr.event.created";
}

export function listPRs(snapshot: Snapshot): string[] {
  const ids = new Set<string>();
  const all = [...snapshot.collabEvents, ...(snapshot.inbox?.events ?? [])];
  for (const ef of all) {
    const e = ef.event;
    if (isPRRootEvent(e)) ids.add((e as any).payload.prKey);
  }
  return [...ids].sort();
}

export function renderPR(snapshot: Snapshot, prKey: string): RenderedPR | undefined {
  const all = [...snapshot.collabEvents, ...(snapshot.inbox?.events ?? [])];
  let root: A5cEventBase | undefined;
  const inboxProposals: RenderedPR["inboxProposals"] = [];

  // Choose deterministic root among proposal/request events:
  // prefer request in main snapshot; otherwise lowest (time, actor, id) across all.
  for (const ef of all) {
    const e = ef.event;
    if (!isPRRootEvent(e)) continue;
    if ((e as any).payload.prKey !== prKey) continue;
    if ((snapshot.inbox?.events ?? []).some((x) => x.path === ef.path) && e.kind === "pr.proposal.created") {
      inboxProposals.push({
        actor: e.actor,
        time: e.time,
        headRef: (e as any).payload.headRef,
        title: (e as any).payload.title
      });
    }
    if (!root) root = e;
    else {
      const a = `${e.time}\0${e.actor}\0${e.id}`;
      const b = `${root.time}\0${root.actor}\0${root.id}`;
      if (a < b) root = e;
    }
  }
  if (!root) return;

  const events: RenderedPR["events"] = [];
  for (const ef of snapshot.collabEvents) {
    const e = ef.event;
    if (!isPREvent(e)) continue;
    if ((e as any).payload.prKey !== prKey) continue;
    events.push({
      time: e.time,
      actor: e.actor,
      action: (e as any).payload.action,
      message: (e as any).payload.message,
      headRef: (e as any).payload.headRef
    });
  }

  return {
    prKey,
    title: (root as any).payload.title,
    body: (root as any).payload.body,
    baseRef: (root as any).payload.baseRef,
    headRef: (root as any).payload.headRef,
    kind: root.kind === "pr.proposal.created" ? "proposal" : "request",
    createdAt: root.time,
    createdBy: root.actor,
    inboxProposals: inboxProposals.length > 0 ? inboxProposals.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.actor < b.actor ? -1 : 1)) : undefined,
    events
  };
}


