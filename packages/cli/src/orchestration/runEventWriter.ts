import fs from "node:fs/promises";
import path from "node:path";

function padSeq(n: number): string {
  return String(n).padStart(6, "0");
}

function safeActor(actor: string): string {
  return actor.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "actor";
}

async function nextSeq(eventsDir: string): Promise<number> {
  let max = 0;
  try {
    const entries = await fs.readdir(eventsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = /^(\d+)__/.exec(e.name);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  } catch {}
  return max + 1;
}

export async function writeRunEvent(opts: {
  repoRoot: string;
  runId: string;
  kind: string;
  stepId: number;
  attempt: number;
  actor: string;
  nowMs: () => number;
  payload: Record<string, unknown>;
}): Promise<string> {
  const eventsDir = path.join(opts.repoRoot, ".collab", "runs", opts.runId, "events");
  await fs.mkdir(eventsDir, { recursive: true });
  const seq = await nextSeq(eventsDir);
  const file = `${padSeq(seq)}__${opts.kind}__s${opts.stepId}__a${opts.attempt}__${safeActor(opts.actor)}.json`;
  const p = path.join(eventsDir, file);
  const ev = {
    schema: "a5cforge/v1",
    kind: opts.kind,
    id: `evt_${opts.runId}_${padSeq(seq)}`,
    time: new Date(opts.nowMs()).toISOString(),
    actor: opts.actor,
    payload: { ...opts.payload, run_id: opts.runId, step_id: opts.stepId, attempt: opts.attempt }
  };
  await fs.writeFile(p, JSON.stringify(ev, null, 2) + "\n", "utf8");
  return p;
}

