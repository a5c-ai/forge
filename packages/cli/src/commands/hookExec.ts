import type { CommandArgs } from "./types.js";
import fs from "node:fs/promises";
import { execPlans } from "../orchestration/hookExecCore.js";

type PlanEnvelope = {
  plans?: Array<{
    run_id: string;
    kind: string;
    step_id?: number;
    attempt?: number;
    step_type?: string;
    hook?: string;
    hook_input?: any;
    events_to_emit_before?: Array<{ kind: string; payload: Record<string, unknown> }>;
    events_expected_after?: string[];
  }>;
};

// run-event writing is centralized in ../orchestration/runEventWriter.ts

async function readPlan(planArg: string | undefined, stdinText?: string): Promise<PlanEnvelope> {
  if (!planArg) throw new Error("missing --plan <path|->");
  if (planArg === "-") {
    if (stdinText == null) throw new Error("missing stdin plan");
    const parsed = JSON.parse(stdinText);
    return Array.isArray(parsed) ? { plans: parsed } : parsed;
  }
  const txt = await fs.readFile(planArg, "utf8");
  const parsed = JSON.parse(txt);
  return Array.isArray(parsed) ? { plans: parsed } : parsed;
}

export async function handleHookExec(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "hook") return;
  const sub = args.positionals[1];
  if (sub !== "exec") {
    args.io.writeLine(args.io.err, "usage: git a5c hook exec --plan <path|->");
    return 2;
  }

  if (args.flags.dryRun) {
    args.io.writeLine(args.io.out, "ok");
    return 0;
  }

  const planArg = typeof args.flags.plan === "string" ? args.flags.plan : undefined;
  const stdinText = planArg === "-" ? await new Promise<string>((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.resume();
  }) : undefined;

  let envelope: PlanEnvelope;
  try {
    envelope = await readPlan(planArg, stdinText);
  } catch (e: any) {
    args.io.writeLine(args.io.err, String(e?.message ?? e));
    return 2;
  }

  const plans = envelope.plans ?? [];
  try {
    await execPlans({ repoRoot: args.repoRoot, plans, nowMs: args.nowMs, actor: "hookexec-cli" });
  } catch (e: any) {
    args.io.writeLine(args.io.err, String(e?.message ?? e));
    return 1;
  }

  args.io.writeLine(args.io.out, "ok");
  return 0;
}
