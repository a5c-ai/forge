import path from "node:path";
import { stageFiles } from "@a5c-ai/sdk";
import type { ParsedEventFile, Snapshot } from "@a5c-ai/sdk";
import { writeRunEvent } from "./runEventWriter.js";
import { git } from "../git.js";

type Key = string;

function k(runId: string, stepId: number, attempt: number): Key {
  return `${runId}::${stepId}::${attempt}`;
}

function parseIsoMs(iso: unknown): number | undefined {
  if (typeof iso !== "string") return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

function payload(ev: ParsedEventFile): any {
  return (ev.event as any)?.payload ?? {};
}

export async function sweepStaleExecutions(opts: {
  repoRoot: string;
  snap: Snapshot;
  nowMs: () => number;
  max: number;
  actor: string;
}): Promise<{ emitted: number }> {
  const idleSeconds = Number(process.env.A5C_STEP_IDLE_SECONDS ?? "180");
  const idleMs = (Number.isFinite(idleSeconds) ? idleSeconds : 180) * 1000;

  const execStarted = new Map<Key, { runId: string; stepId: number; attempt: number; t: number }>();
  const lastHeartbeat = new Map<Key, number>();
  const terminal = new Set<Key>();

  for (const ev of opts.snap.collabEvents) {
    if (!ev.kind.startsWith("run.")) continue;
    const p = payload(ev);
    const runId = p.run_id;
    const stepId = p.step_id;
    const attempt = p.attempt;
    if (typeof runId !== "string" || typeof stepId !== "number" || typeof attempt !== "number") continue;

    const key = k(runId, stepId, attempt);
    if (ev.kind === "run.step.exec.started") {
      const t = parseIsoMs(ev.event.time) ?? 0;
      execStarted.set(key, { runId, stepId, attempt, t });
    }
    if (ev.kind === "run.step.heartbeat") {
      const t = parseIsoMs(p.observed_at) ?? parseIsoMs(ev.event.time) ?? 0;
      const cur = lastHeartbeat.get(key) ?? 0;
      if (t > cur) lastHeartbeat.set(key, t);
    }
    if (ev.kind === "run.step.completed" || ev.kind === "run.step.failed" || ev.kind === "run.reward.reported") {
      terminal.add(key);
    }
  }

  let emitted = 0;
  const staged: string[] = [];
  for (const v of execStarted.values()) {
    if (emitted >= opts.max) break;
    const key = k(v.runId, v.stepId, v.attempt);
    if (terminal.has(key)) continue;
    const hb = lastHeartbeat.get(key);
    const lastSeen = Math.max(v.t, hb ?? 0);
    if (opts.nowMs() - lastSeen <= idleMs) continue;

    staged.push(
      await writeRunEvent({
        repoRoot: opts.repoRoot,
        runId: v.runId,
        kind: "run.step.exec.timed_out",
        stepId: v.stepId,
        attempt: v.attempt,
        actor: opts.actor,
        nowMs: opts.nowMs,
        payload: { observed_at: new Date(opts.nowMs()).toISOString(), reason: "heartbeat_stale" }
      })
    );
    staged.push(
      await writeRunEvent({
        repoRoot: opts.repoRoot,
        runId: v.runId,
        kind: "run.human.waiting",
        stepId: v.stepId,
        attempt: v.attempt,
        actor: opts.actor,
        nowMs: opts.nowMs,
        payload: { reason: "timeout" }
      })
    );
    emitted++;
  }

  if (staged.length) {
    await stageFiles(opts.repoRoot, staged.map((p) => path.relative(opts.repoRoot, p)));
    await git(
      [
        "-c",
        "user.name=a5c",
        "-c",
        "user.email=a5c@example.invalid",
        "commit",
        "--no-gpg-sign",
        "-m",
        `a5c: sweep (${emitted} stale)`
      ],
      opts.repoRoot
    );
  }

  return { emitted };
}

