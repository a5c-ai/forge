import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunEvent } from "./runEventWriter.js";
import { UlidGenerator, computeRewardReportFromEvidence, parseTemplate, stageFiles } from "@a5c-ai/sdk";
import { git } from "../git.js";
import fs from "node:fs/promises";

async function validateHookOutputIfEnabled(opts: {
  repoRoot: string;
  schemaFile: string;
  value: unknown;
  label: string;
}): Promise<void> {
  const enabled = String(process.env.A5C_VALIDATE_HOOK_IO || "").toLowerCase();
  if (!(enabled === "1" || enabled === "true" || enabled === "yes")) return;

  try {
    const AjvMod: any = await import("ajv/dist/2020.js");
    const AddFormatsMod: any = await import("ajv-formats");
    const Ajv: any = AjvMod?.default ?? AjvMod;
    const addFormats: any = AddFormatsMod?.default ?? AddFormatsMod;
    const ajv = new Ajv({ allErrors: true, strict: false });
    if (typeof addFormats === "function") addFormats(ajv);

    const schemaPath = await findSchemaPath({ repoRoot: opts.repoRoot, schemaFile: opts.schemaFile });
    const raw = await fs.readFile(schemaPath, "utf8");
    const schema = JSON.parse(raw);
    const validate = ajv.compile(schema);
    const ok = validate(opts.value);
    if (!ok) {
      const errs = (validate.errors ?? []).slice(0, 5);
      throw new Error(`${opts.label}: schema validation failed: ${JSON.stringify(errs)}`);
    }
  } catch (e: any) {
    throw new Error(`${opts.label}: ${String(e?.message ?? e)}`);
  }
}

async function findSchemaPath(opts: { repoRoot: string; schemaFile: string }): Promise<string> {
  const direct = path.join(opts.repoRoot, "spec", "schemas", opts.schemaFile);
  if (await exists(direct)) return direct;

  // Fall back to locating the monorepo root / installed package layout.
  // Walk upwards from the current module directory and look for `spec/schemas/<schemaFile>`.
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const start of [here, process.cwd()]) {
    let cur = start;
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(cur, "spec", "schemas", opts.schemaFile);
      if (await exists(candidate)) return candidate;
      const next = path.dirname(cur);
      if (next === cur) break;
      cur = next;
    }
  }

  throw new Error(`schema file not found: ${opts.schemaFile}`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export type ExecutePlanEntry = {
  run_id: string;
  kind: string;
  step_id?: number;
  attempt?: number;
  step_type?: string;
  hook?: string;
  hook_input?: any;
  events_to_emit_before?: Array<{ kind: string; payload: Record<string, unknown> }>;
  events_expected_after?: string[];
};

async function runHook(opts: { cwd: string; hookPath: string; input: any }): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const abs = path.isAbsolute(opts.hookPath) ? opts.hookPath : path.join(opts.cwd, opts.hookPath);
  const ext = path.extname(abs).toLowerCase();
  const cmd = ext === ".js" || ext === ".mjs" ? process.execPath : abs;
  const argv = ext === ".js" || ext === ".mjs" ? [abs] : [];

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: process.env });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));
    child.on("error", reject);
    child.stdin.write(JSON.stringify(opts.input) + "\n");
    child.stdin.end();
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0) return resolve({ ok: false, stdout, stderr });
      resolve({ ok: true, stdout, stderr });
    });
  });
}

async function runEvidenceProducer(opts: {
  repoRoot: string;
  runId: string;
  stepId: number;
  attempt: number;
  signalId: string;
  producerId: string;
  producerArgs?: Record<string, unknown>;
  hook: string;
}): Promise<any[]> {
  const artifactRoot = path.join("artifacts", "runs", opts.runId, `step_${opts.stepId}`, `attempt_${opts.attempt}`);
  await fs.mkdir(path.join(opts.repoRoot, artifactRoot), { recursive: true });

  const input = {
    run_id: opts.runId,
    step_id: opts.stepId,
    attempt: opts.attempt,
    signal_id: opts.signalId,
    producer: opts.producerId,
    producer_args: opts.producerArgs ?? {},
    artifact_root: artifactRoot
  };

  const res = await runHook({ cwd: opts.repoRoot, hookPath: opts.hook, input });
  if (!res.ok) throw new Error(`evidence producer failed: ${opts.producerId}: ${res.stderr.slice(0, 2000)}`);

  let parsed: any;
  try {
    parsed = JSON.parse(res.stdout.trim() || "{}");
  } catch {
    throw new Error(`evidence producer invalid json: ${opts.producerId}`);
  }

  await validateHookOutputIfEnabled({
    repoRoot: opts.repoRoot,
    schemaFile: "run.hook.evidence.output.schema.json",
    value: parsed,
    label: `evidence hook output ${opts.producerId} (${opts.signalId})`
  });

  if (!parsed?.ok) throw new Error(`evidence producer returned ok=false: ${opts.producerId}`);
  return Array.isArray(parsed.evidence) ? parsed.evidence : [];
}

export async function execPlans(opts: {
  repoRoot: string;
  plans: ExecutePlanEntry[];
  nowMs: () => number;
  actor?: string;
  heartbeatMs?: number;
}): Promise<void> {
  const actor = opts.actor ?? "hookexec-cli";
  const heartbeatMs = opts.heartbeatMs ?? Number(process.env.A5C_HEARTBEAT_MS ?? "30000");

  for (const p of opts.plans) {
    if (p.kind !== "EXECUTE_STEP") continue;
    const stepId = p.step_id;
    const attempt = p.attempt;
    if (!p.run_id || typeof stepId !== "number" || typeof attempt !== "number" || !p.hook) {
      throw new Error("invalid plan entry");
    }

    const pathsToStage: string[] = [];

    for (const ev of p.events_to_emit_before ?? []) {
      pathsToStage.push(
        await writeRunEvent({ repoRoot: opts.repoRoot, runId: p.run_id, kind: ev.kind, stepId, attempt, actor, nowMs: opts.nowMs, payload: ev.payload })
      );
    }

    pathsToStage.push(
      await writeRunEvent({
        repoRoot: opts.repoRoot,
        runId: p.run_id,
        kind: "run.step.exec.started",
        stepId,
        attempt,
        actor,
        nowMs: opts.nowMs,
        payload: {}
      })
    );

    let hbTimer: NodeJS.Timeout | undefined;
    let hbSeq = 0;
    const emitHeartbeat = async () => {
      hbSeq++;
      const pth = await writeRunEvent({
        repoRoot: opts.repoRoot,
        runId: p.run_id,
        kind: "run.step.heartbeat",
        stepId,
        attempt,
        actor,
        nowMs: opts.nowMs,
        payload: { seq: hbSeq, observed_at: new Date(opts.nowMs()).toISOString() }
      });
      pathsToStage.push(pth);
    };
    if (Number.isFinite(heartbeatMs) && heartbeatMs > 0) {
      hbTimer = setInterval(() => {
        void emitHeartbeat();
      }, heartbeatMs);
    }

    const hookRes = await runHook({ cwd: opts.repoRoot, hookPath: p.hook, input: p.hook_input ?? {} });
    if (hbTimer) clearInterval(hbTimer);

    if (!hookRes.ok) {
      pathsToStage.push(
        await writeRunEvent({
        repoRoot: opts.repoRoot,
        runId: p.run_id,
        kind: "run.step.failed",
        stepId,
        attempt,
        actor,
        nowMs: opts.nowMs,
        payload: { reason: "exec_failure", stderr: hookRes.stderr.slice(0, 2000) }
        })
      );
      await stageFiles(opts.repoRoot, pathsToStage.map((x) => path.relative(opts.repoRoot, x)));
      await git([
        "-c",
        "user.name=a5c",
        "-c",
        "user.email=a5c@example.invalid",
        "commit",
        "--no-gpg-sign",
        "-m",
        `a5c: ${p.run_id} step ${stepId} attempt ${attempt} (failed)`
      ], opts.repoRoot);
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(hookRes.stdout.trim() || "{}");
    } catch {
      parsed = { ok: false, error: "invalid hook json" };
    }

    if (p.step_type === "reward") {
      await validateHookOutputIfEnabled({
        repoRoot: opts.repoRoot,
        schemaFile: "run.hook.step.output.reward.schema.json",
        value: parsed,
        label: `hook output (reward) ${p.run_id} step ${stepId} attempt ${attempt}`
      });
    } else {
      await validateHookOutputIfEnabled({
        repoRoot: opts.repoRoot,
        schemaFile: "run.hook.step.output.agent.schema.json",
        value: parsed,
        label: `hook output (agent) ${p.run_id} step ${stepId} attempt ${attempt}`
      });
    }

    if (Array.isArray(parsed?.spawn) && parsed.spawn.length) {
      for (const s of parsed.spawn) {
        const ref = typeof s?.playbook === "string" ? s.playbook : typeof s?.template_ref === "string" ? s.template_ref : undefined;
        if (!ref) continue;
        const at = ref.lastIndexOf("@");
        const playbookPath = at >= 0 ? ref.slice(0, at) : ref;
        const playbookVersion = at >= 0 ? ref.slice(at + 1) : "v1";
        const depRunId = `run_${new UlidGenerator({ nowMs: opts.nowMs }).generate()}`;

        const playbookText = await fs.readFile(path.join(opts.repoRoot, playbookPath), "utf8");
        const depTemplate = parseTemplate(playbookText, playbookPath);
        const depFirst = [...depTemplate.steps].sort((a, b) => a.step_id - b.step_id)[0];
        if (!depFirst) continue;

        pathsToStage.push(
          await writeRunEvent({
            repoRoot: opts.repoRoot,
            runId: depRunId,
            kind: "run.dispatched",
            stepId: 0,
            attempt: 0,
            actor,
            nowMs: opts.nowMs,
            payload: { playbook: { path: playbookPath, version: playbookVersion } }
          })
        );
        pathsToStage.push(
          await writeRunEvent({
            repoRoot: opts.repoRoot,
            runId: depRunId,
            kind: "run.step.scheduled",
            stepId: depFirst.step_id,
            attempt: 1,
            actor,
            nowMs: opts.nowMs,
            payload: {}
          })
        );

        pathsToStage.push(
          await writeRunEvent({
            repoRoot: opts.repoRoot,
            runId: p.run_id,
            kind: "run.dep.spawned",
            stepId,
            attempt,
            actor,
            nowMs: opts.nowMs,
            payload: { dep_run_id: depRunId, parent_step_id: stepId, parent_attempt: attempt, playbook: { path: playbookPath, version: playbookVersion } }
          })
        );
      }
    }

    if (p.step_type === "reward") {
      const template = p.hook_input?.template;
      const rewardStep = Array.isArray(template?.steps) ? template.steps.find((s: any) => s?.step_id === stepId) : undefined;
      const rewardReport = parsed?.reward_report;

      if (rewardReport) {
        const rewardTotal = typeof rewardReport.reward_total === "number" ? rewardReport.reward_total : undefined;
        if (typeof rewardTotal !== "number" || !Number.isFinite(rewardTotal)) {
          pathsToStage.push(
            await writeRunEvent({
              repoRoot: opts.repoRoot,
              runId: p.run_id,
              kind: "run.step.failed",
              stepId,
              attempt,
              actor,
              nowMs: opts.nowMs,
              payload: { reason: "invalid_reward_report" }
            })
          );
          await stageFiles(opts.repoRoot, pathsToStage.map((x) => path.relative(opts.repoRoot, x)));
          await git(
            [
              "-c",
              "user.name=a5c",
              "-c",
              "user.email=a5c@example.invalid",
              "commit",
              "--no-gpg-sign",
              "-m",
              `a5c: ${p.run_id} step ${stepId} attempt ${attempt}`
            ],
            opts.repoRoot
          );
          continue;
        }
        const signals = rewardReport && typeof rewardReport.signals === "object" && rewardReport.signals ? rewardReport.signals : {};
        pathsToStage.push(
          await writeRunEvent({
            repoRoot: opts.repoRoot,
            runId: p.run_id,
            kind: "run.reward.reported",
            stepId,
            attempt,
            actor,
            nowMs: opts.nowMs,
            payload: { reward_total: rewardTotal, signals, data: rewardReport }
          })
        );
      } else if (rewardStep?.reward && template?.signals && template?.evidence_producers) {
        const evidenceHooks = p.hook_input?.hook_mapping?.evidence_hooks ?? {};
        const evidenceBySignal: Record<string, any[]> = {};
        for (const signalId of rewardStep.reward.signals ?? []) {
          const sigCfg = template.signals?.[signalId];
          const producerId = sigCfg?.producer;
          const producer = producerId ? template.evidence_producers?.[producerId] : undefined;
          const hookName = producer?.kind ? evidenceHooks[producer.kind] : undefined;
          const hook = typeof hookName === "string" && hookName ? path.posix.join(".a5c/hooks/evidence", hookName) + ".js" : undefined;
          if (!producerId || !hook) {
            evidenceBySignal[signalId] = [];
            continue;
          }
          evidenceBySignal[signalId] = await runEvidenceProducer({
            repoRoot: opts.repoRoot,
            runId: p.run_id,
            stepId,
            attempt,
            signalId,
            producerId,
            producerArgs: sigCfg?.producer_args,
            hook
          });
        }

        const computed = computeRewardReportFromEvidence({ template, step: rewardStep, evidenceBySignal });
        pathsToStage.push(
          await writeRunEvent({
            repoRoot: opts.repoRoot,
            runId: p.run_id,
            kind: "run.reward.reported",
            stepId,
            attempt,
            actor,
            nowMs: opts.nowMs,
            payload: { reward_total: computed.reward_total, signals: computed.signals, data: computed }
          })
        );
      } else {
        pathsToStage.push(
          await writeRunEvent({
            repoRoot: opts.repoRoot,
            runId: p.run_id,
            kind: "run.step.failed",
            stepId,
            attempt,
            actor,
            nowMs: opts.nowMs,
            payload: { reason: "reward_missing_report" }
          })
        );
      }
    } else if (parsed?.ok) {
      pathsToStage.push(
        await writeRunEvent({ repoRoot: opts.repoRoot, runId: p.run_id, kind: "run.step.completed", stepId, attempt, actor, nowMs: opts.nowMs, payload: {} })
      );
    } else {
      pathsToStage.push(
        await writeRunEvent({
        repoRoot: opts.repoRoot,
        runId: p.run_id,
        kind: "run.step.failed",
        stepId,
        attempt,
        actor,
        nowMs: opts.nowMs,
        payload: { reason: String(parsed?.error ?? "hook_failed") }
        })
      );
    }

    await stageFiles(opts.repoRoot, pathsToStage.map((x) => path.relative(opts.repoRoot, x)));
    await git(
      [
        "-c",
        "user.name=a5c",
        "-c",
        "user.email=a5c@example.invalid",
        "commit",
        "--no-gpg-sign",
        "-m",
        `a5c: ${p.run_id} step ${stepId} attempt ${attempt}`
      ],
      opts.repoRoot
    );
  }
}
