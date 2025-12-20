import type { CommandArgs } from "./types.js";
import { parseSinceToEpochMs } from "../time.js";

function typeMatches(kind: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((p) => (p.endsWith(".*") ? kind.startsWith(p.slice(0, -2)) : kind === p));
}

function entityMatches(ev: any, entity: string | undefined): boolean {
  if (!entity) return true;
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

export async function handleJournal(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "journal") return;

  const limit = Number.isFinite(args.flags.limit as any) ? (args.flags.limit as number) : 20;
  const sinceMs = args.flags.since ? parseSinceToEpochMs(args.flags.since, args.nowMs()) : undefined;
  const events = [...args.snap.collabEvents, ...(args.snap.inbox?.events ?? [])]
    .map((e: any) => ({
      time: (e.event as any).time as string,
      actor: (e.event as any).actor as string,
      kind: e.kind,
      id: (e.event as any).id as string,
      payload: (e.event as any).payload as any
    }))
    .filter((e: any) => typeMatches(e.kind, args.flags.types))
    .filter((e: any) => entityMatches({ kind: e.kind, payload: e.payload }, args.flags.entity))
    .filter((e: any) => {
      if (!sinceMs) return true;
      const t = Date.parse(e.time);
      return Number.isFinite(t) && t >= sinceMs;
    })
    .sort((a: any, b: any) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.id < b.id ? 1 : -1))
    .slice(0, limit);

  if (args.flags.json) {
    const base = events.map(({ payload: _p, ...rest }: any) => rest);
    if (!args.flags.active) {
      args.io.writeLine(args.io.out, JSON.stringify(base, null, 2));
      return 0;
    }
    const now = args.nowMs();
    const byAgent = new Map<string, any>();
    for (const e of events) {
      if (e.kind !== "agent.heartbeat.created") continue;
      const agentId = String(e.payload?.agentId ?? "");
      if (!agentId) continue;
      byAgent.set(agentId, e);
    }
    const active = [...byAgent.values()].filter((e) => {
      const ttlSeconds = Number(e.payload?.ttlSeconds ?? 0);
      const t = Date.parse(e.time);
      return Number.isFinite(t) && ttlSeconds > 0 && t + ttlSeconds * 1000 >= now;
    });
    args.io.writeLine(args.io.out, JSON.stringify({ events: base, activeAgents: active }, null, 2));
    return 0;
  }

  for (const e of events) {
    args.io.writeLine(args.io.out, `${e.time} ${e.actor} ${e.kind} ${e.id}`);
  }
  return 0;
}


