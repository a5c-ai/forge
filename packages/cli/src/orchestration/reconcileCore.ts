import path from "node:path";
import { applyTemplatePatch, deriveRunState, parseHookMapping, parseTemplate, planNextTransition } from "@a5c-ai/sdk";
import type { IGit, ParsedEventFile, Snapshot } from "@a5c-ai/sdk";
import { writeRunEvent } from "./runEventWriter.js";
import { stageFiles } from "@a5c-ai/sdk";
import { git } from "../git.js";

type RunMeta = {
  runId: string;
  playbookPath?: string;
  playbookVersion?: string;
  templatePatch?: unknown;
  events: ParsedEventFile[];
};

export type ReconcileEnvelope = {
  actor: string;
  treeish: string;
  plans: any[];
};

export async function getRunContext(opts: {
  repoRoot: string;
  snap: Snapshot;
  runId: string;
}): Promise<{ playbookPath: string; templatePatch?: unknown; events: ParsedEventFile[] } | undefined> {
  let playbookPath: string | undefined;
  let templatePatch: unknown;
  const events: ParsedEventFile[] = [];

  for (const ev of opts.snap.collabEvents) {
    if (!ev.kind.startsWith("run.")) continue;
    const p = (ev.event as any)?.payload ?? {};
    if (p.run_id !== opts.runId) continue;
    events.push(ev);
    if (ev.kind === "run.dispatched" && p.playbook && !playbookPath) {
      playbookPath = String(p.playbook.path ?? "");
      templatePatch = p.template_patch;
    }
  }

  if (!playbookPath) return undefined;
  return { playbookPath, templatePatch, events };
}

export async function reconcileOrchestration(opts: {
  repoRoot: string;
  treeish: string;
  repoGit: IGit;
  snap: Snapshot;
  nowMs: () => number;
  actor?: string;
  emitNonExecEvents?: boolean;
  runId?: string;
  maxTransitions?: number;
}): Promise<ReconcileEnvelope> {
  const actor = opts.actor ?? "runner:cli";
  const commitOid = await opts.repoGit.revParse(opts.treeish);

  const runs = new Map<string, RunMeta>();
  for (const ev of opts.snap.collabEvents) {
    if (!ev.kind.startsWith("run.")) continue;
    const payload = (ev.event as any)?.payload ?? {};
    const runId = payload.run_id;
    if (typeof runId !== "string" || !runId) continue;
    const meta = runs.get(runId) ?? { runId, events: [] };
    meta.events.push(ev);
    if (ev.kind === "run.dispatched" && payload.playbook && !meta.playbookPath) {
      meta.playbookPath = String(payload.playbook.path ?? "");
      meta.playbookVersion = payload.playbook.version ? String(payload.playbook.version) : undefined;
      meta.templatePatch = payload.template_patch;
    }
    runs.set(runId, meta);
  }

  const plans: any[] = [];
  const pathsToCommit: string[] = [];

  const hookMappingPath = ".a5c/hooks/by-file-name-mapping/01-ordered-hook.yaml";
  let hookMapping: any;
  try {
    const hookMappingText = (await opts.repoGit.readBlob(commitOid, hookMappingPath)).toString("utf8");
    hookMapping = parseHookMapping(hookMappingText, hookMappingPath);
  } catch (e: any) {
    // Emit a durable error event per run so the failure is visible in history.
    if (opts.emitNonExecEvents !== false) {
      for (const meta of runs.values()) {
        const p = await writeRunEvent({
          repoRoot: opts.repoRoot,
          runId: meta.runId,
          kind: "run.runner.config_error",
          stepId: 0,
          attempt: 0,
          actor,
          nowMs: opts.nowMs,
          payload: { message: String(e?.message ?? e), path: hookMappingPath }
        });
        pathsToCommit.push(p);
      }
    }

    // Also surface a plan entry so `run reconcile` callers can see a non-zero-ish state.
    for (const meta of runs.values()) {
      plans.push({ run_id: meta.runId, kind: "WAIT_HUMAN", reason: "runner_config_error", events_to_emit: [] });
    }

    if (pathsToCommit.length) {
      await stageFiles(opts.repoRoot, pathsToCommit.map((p) => path.relative(opts.repoRoot, p)));
      await git(
        [
          "-c",
          "user.name=a5c",
          "-c",
          "user.email=a5c@example.invalid",
          "commit",
          "--no-gpg-sign",
          "-m",
          "a5c: reconcile (runner config error)"
        ],
        opts.repoRoot
      );
    }

    return { actor, treeish: opts.treeish, plans };
  }

  for (const meta of runs.values()) {
    if (typeof opts.maxTransitions === "number" && plans.length >= opts.maxTransitions) break;
    if (opts.runId && meta.runId !== opts.runId) continue;
    if (!meta.playbookPath) continue;
    const text = (await opts.repoGit.readBlob(commitOid, meta.playbookPath)).toString("utf8");
    const baseTemplate = parseTemplate(text, meta.playbookPath);
    const template = meta.templatePatch ? applyTemplatePatch(baseTemplate, meta.templatePatch) : baseTemplate;

    const state = deriveRunState({ runId: meta.runId, template, events: meta.events });

    if (state.status === "WAIT_DEPS" && opts.emitNonExecEvents !== false) {
      for (const depRunId of state.deps.pending) {
        const depMeta = runs.get(depRunId);
        if (!depMeta?.playbookPath) continue;
        const depText = (await opts.repoGit.readBlob(commitOid, depMeta.playbookPath)).toString("utf8");
        const depBaseTemplate = parseTemplate(depText, depMeta.playbookPath);
        const depTemplate = depMeta.templatePatch ? applyTemplatePatch(depBaseTemplate, depMeta.templatePatch) : depBaseTemplate;
        const depState = deriveRunState({ runId: depRunId, template: depTemplate, events: depMeta.events });
        if (depState.status !== "DONE" && depState.status !== "CANCELLED") continue;

        const p = await writeRunEvent({
          repoRoot: opts.repoRoot,
          runId: meta.runId,
          kind: "run.dep.completed",
          stepId: state.current.step_id,
          attempt: state.current.attempt,
          actor,
          nowMs: opts.nowMs,
          payload: { dep_run_id: depRunId, observed_at: new Date(opts.nowMs()).toISOString() }
        });
        pathsToCommit.push(p);
      }
    }

    const t = planNextTransition({
      state,
      template,
      resolveStepHook: (step) => {
        if (step.type === "agent") return hookMapping.step_hooks.agent;
        if (step.type === "reward") return hookMapping.step_hooks.reward;
        throw new Error(`no hook for step type: ${step.type}`);
      }
    });
    if (!t) continue;

    if (t.kind === "EXECUTE_STEP") {
      const hookName = t.step_type === "agent" ? hookMapping.step_hooks.agent : hookMapping.step_hooks.reward;
      const agentProfile = t.step_type === "agent" ? String((t.hook_input as any)?.agent?.profile ?? "default") : "";

      const resolvedName = String(hookName).includes("[profile]") ? String(hookName).replaceAll("[profile]", agentProfile) : String(hookName);
      const hook = path.posix.join(".a5c/hooks/steps", resolvedName) + ".js";
      const hook_input = {
        ...t.hook_input,
        hook_mapping: hookMapping
      };
      plans.push({ run_id: meta.runId, ...t, hook, hook_input });
      continue;
    }

    // Runner may emit non-executable events immediately.
    if (opts.emitNonExecEvents !== false && t.kind === "WAIT_HUMAN") {
      for (const ev of t.events_to_emit) {
        const p = await writeRunEvent({
          repoRoot: opts.repoRoot,
          runId: meta.runId,
          kind: ev.kind,
          stepId: state.current.step_id,
          attempt: state.current.attempt,
          actor,
          nowMs: opts.nowMs,
          payload: ev.payload
        });
        pathsToCommit.push(p);
      }
    }

    plans.push({ run_id: meta.runId, ...t });
  }

  if (pathsToCommit.length) {
    await stageFiles(opts.repoRoot, pathsToCommit.map((p) => path.relative(opts.repoRoot, p)));
    await git(
      [
        "-c",
        "user.name=a5c",
        "-c",
        "user.email=a5c@example.invalid",
        "commit",
        "--no-gpg-sign",
        "-m",
        "a5c: reconcile (non-exec events)"
      ],
      opts.repoRoot
    );
  }

  return { actor, treeish: opts.treeish, plans };
}
