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
  needsHuman?: { topic?: string; message?: string };
  blockers?: { by: { type: "issue" | "pr"; id: string }; note?: string }[];
  agentClaims?: { agentId: string; by: string; time: string; note?: string }[];
  agentHeartbeats?: { time: string; actor: string; agentId: string; ttlSeconds?: number; status?: string }[];
  opsEvents?: { time: string; actor: string; op: string; status?: string; artifact?: any }[];
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
  const blockers = new Map<string, { by: { type: "issue" | "pr"; id: string }; note?: string }>();
  let needsHuman: RenderedPR["needsHuman"];
  const claims = new Map<string, { agentId: string; by: string; time: string; note?: string }>();
  const agentHeartbeats: RenderedPR["agentHeartbeats"] = [];
  const opsEvents: RenderedPR["opsEvents"] = [];

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
    if (e.kind === "dep.changed") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "pr" && ent?.id === prKey) {
        const by = (e as any).payload.by;
        const op = (e as any).payload.op;
        const key = `${by?.type}:${by?.id}`;
        if (op === "add") blockers.set(key, { by, note: (e as any).payload.note });
        if (op === "remove") blockers.delete(key);
      }
    }
    if (e.kind === "gate.changed") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "pr" && ent?.id === prKey) {
        const nh = Boolean((e as any).payload.needsHuman);
        if (nh) needsHuman = { topic: (e as any).payload.topic, message: (e as any).payload.message };
        else needsHuman = undefined;
      }
    }
    if (e.kind === "agent.claim.changed") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "pr" && ent?.id === prKey) {
        const op = String((e as any).payload.op ?? "");
        const agentId = String((e as any).payload.agentId ?? "");
        if (agentId) {
          if (op === "claim") claims.set(agentId, { agentId, by: e.actor, time: e.time, note: (e as any).payload.note });
          if (op === "release") claims.delete(agentId);
        }
      }
    }
    if (e.kind === "agent.heartbeat.created") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "pr" && ent?.id === prKey) {
        agentHeartbeats.push({
          time: e.time,
          actor: e.actor,
          agentId: (e as any).payload.agentId,
          ttlSeconds: (e as any).payload.ttlSeconds,
          status: (e as any).payload.status
        });
      }
    }
    if (e.kind === "ops.event.created") {
      const ent = (e as any).payload?.entity;
      if (ent?.type === "pr" && ent?.id === prKey) {
        opsEvents.push({
          time: e.time,
          actor: e.actor,
          op: (e as any).payload.op,
          status: (e as any).payload.status,
          artifact: (e as any).payload.artifact
        });
      }
    }
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
    needsHuman,
    blockers: blockers.size > 0 ? [...blockers.values()] : undefined,
    agentClaims: claims.size > 0 ? [...claims.values()] : undefined,
    agentHeartbeats: agentHeartbeats.length > 0 ? agentHeartbeats : undefined,
    opsEvents: opsEvents.length > 0 ? opsEvents : undefined,
    inboxProposals: inboxProposals.length > 0 ? inboxProposals.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.actor < b.actor ? -1 : 1)) : undefined,
    events
  };
}


