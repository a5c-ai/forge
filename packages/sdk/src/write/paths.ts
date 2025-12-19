import path from "node:path";

export function yyyyMmFromIsoTime(isoTime: string): { yyyy: string; mm: string } {
  // isoTime like 2025-12-19T...
  const yyyy = isoTime.slice(0, 4);
  const mm = isoTime.slice(5, 7);
  if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm)) throw new Error(`Invalid isoTime: ${isoTime}`);
  return { yyyy, mm };
}

export function eventFilename(opts: { tsMs: number; actor: string; nonce4: string; kind: string; ext: "json" | "md" }): string {
  if (!/^\d{13}$/.test(String(opts.tsMs))) throw new Error(`tsMs must be 13-digit ms epoch: ${opts.tsMs}`);
  if (!/^\d{4}$/.test(opts.nonce4)) throw new Error(`nonce4 must be 4 digits: ${opts.nonce4}`);
  return `${opts.tsMs}_${opts.actor}_${opts.nonce4}.${opts.kind}.${opts.ext}`;
}

export function issueEventDir(issueId: string, isoTime: string): string {
  const { yyyy, mm } = yyyyMmFromIsoTime(isoTime);
  return path.posix.join(".collab", "issues", issueId, "events", yyyy, mm);
}

export function prEventDir(prKey: string, isoTime: string): string {
  const { yyyy, mm } = yyyyMmFromIsoTime(isoTime);
  return path.posix.join(".collab", "prs", prKey, "events", yyyy, mm);
}

export function agentsEventDir(isoTime: string): string {
  const { yyyy, mm } = yyyyMmFromIsoTime(isoTime);
  return path.posix.join(".collab", "agents", "events", yyyy, mm);
}

export function opsEventDir(isoTime: string): string {
  const { yyyy, mm } = yyyyMmFromIsoTime(isoTime);
  return path.posix.join(".collab", "ops", "events", yyyy, mm);
}


