import type { CommandArgs } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { UlidGenerator, applyTemplatePatch, deriveRunState, loadSnapshot, parseTemplate, stageFiles } from "@a5c-ai/sdk";
import { execPlans } from "../orchestration/hookExecCore.js";
import { getRunContext, reconcileOrchestration } from "../orchestration/reconcileCore.js";
import { sweepStaleExecutions } from "../orchestration/sweepCore.js";
import { writeRunEvent } from "../orchestration/runEventWriter.js";
import { git } from "../git.js";

export async function handleRunOrchestration(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "run") return;
  const sub = args.positionals[1];
  if (
    sub !== "reconcile" &&
    sub !== "tick" &&
    sub !== "dispatch" &&
    sub !== "playbook" &&
    sub !== "sweep" &&
    sub !== "resume" &&
    sub !== "complete-step"
  ) {
    args.io.writeLine(args.io.err, "usage: git a5c run dispatch|playbook|reconcile|tick|sweep|resume|complete-step");
    return 2;
  }

  async function dispatchRun(opts: { playbook: string; runId?: string; overridesFile?: string }): Promise<string | undefined> {
    const playbook = opts.playbook;
    if (!playbook) {
      args.io.writeLine(args.io.err, "usage: git a5c run dispatch --playbook <path>@<version> [--run-id <id>] [--overrides-file <path>]");
      return;
    }
    const at = playbook.lastIndexOf("@");
    const playbookPath = at >= 0 ? playbook.slice(0, at) : playbook;
    const playbookVersion = at >= 0 ? playbook.slice(at + 1) : "v1";
    const runId = opts.runId ?? `run_${new UlidGenerator({ nowMs: args.nowMs }).generate()}`;

    let templatePatch: any;
    if (opts.overridesFile) {
      const txt = await fs.readFile(path.join(args.repoRoot, opts.overridesFile), "utf8");
      const obj = JSON.parse(txt);
      templatePatch = obj?.template_patch ?? obj;
    }

    const commitOid = await args.repo.git.revParse(args.treeish);
    const playbookText = (await args.repo.git.readBlob(commitOid, playbookPath)).toString("utf8");
    const template = parseTemplate(playbookText, playbookPath);
    const firstStep = [...template.steps].sort((a, b) => a.step_id - b.step_id)[0];
    if (!firstStep) {
      args.io.writeLine(args.io.err, "playbook has no steps");
      return;
    }

    const written: string[] = [];
    written.push(
      await writeRunEvent({
        repoRoot: args.repoRoot,
        runId,
        kind: "run.dispatched",
        stepId: 0,
        attempt: 0,
        actor: "runner:cli",
        nowMs: args.nowMs,
        payload: { playbook: { path: playbookPath, version: playbookVersion }, ...(templatePatch ? { template_patch: templatePatch } : {}) }
      })
    );
    written.push(
      await writeRunEvent({
        repoRoot: args.repoRoot,
        runId,
        kind: "run.step.scheduled",
        stepId: firstStep.step_id,
        attempt: 1,
        actor: "runner:cli",
        nowMs: args.nowMs,
        payload: {}
      })
    );

    await stageFiles(args.repoRoot, written.map((p) => path.relative(args.repoRoot, p)));
    await git(
      ["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "--no-gpg-sign", "-m", `a5c: dispatch ${runId}`],
      args.repoRoot
    );

    return runId;
  }

  if (sub === "dispatch") {
    const runId = await dispatchRun({ playbook: args.flags.playbook ?? "", runId: args.flags.runId, overridesFile: args.flags.overridesFile });
    if (!runId) return 2;
    args.io.writeLine(args.io.out, runId);
    return 0;
  }

  if (sub === "playbook") {
    const runId = await dispatchRun({ playbook: args.flags.playbook ?? "", runId: args.flags.runId, overridesFile: args.flags.overridesFile });
    if (!runId) return 2;

    const maxIterations = Number.isFinite(args.flags.maxIterations) ? (args.flags.maxIterations as number) : 50;
    let snap = await loadSnapshot({ git: args.repo.git, treeish: args.treeish, inboxRefs: args.flags.inboxRefs });
    let lastEnvelope: any;
    let iterations = 0;

    const collectRunIds = (root: string, snapshot: any): string[] => {
      const out = new Set<string>([root]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const ev of snapshot.collabEvents ?? []) {
          if (ev?.kind !== "run.dep.spawned") continue;
          const p = (ev.event as any)?.payload ?? {};
          const parent = p.run_id;
          const dep = p.dep_run_id;
          if (typeof parent === "string" && typeof dep === "string" && out.has(parent) && !out.has(dep)) {
            out.add(dep);
            changed = true;
          }
        }
      }
      return [...out];
    };

    const deriveStatus = async (root: string, snapshot: any): Promise<{ status: string; runs: Array<{ run_id: string; status: string; playbook?: string }> }> => {
      const ids = collectRunIds(root, snapshot);
      const results: Array<{ run_id: string; status: string; playbook?: string }> = [];

      for (const id of ids) {
        const ctx = await getRunContext({ repoRoot: args.repoRoot, snap: snapshot, runId: id });
        if (!ctx) {
          results.push({ run_id: id, status: "UNKNOWN" });
          continue;
        }
        const commitOid = await args.repo.git.revParse(args.treeish);
        const playbookText = (await args.repo.git.readBlob(commitOid, ctx.playbookPath)).toString("utf8");
        const template = parseTemplate(playbookText, ctx.playbookPath);
        const state = deriveRunState({ runId: id, template: ctx.templatePatch ? applyTemplatePatch(template, ctx.templatePatch) : template, events: ctx.events });
        results.push({ run_id: id, status: state.status, playbook: ctx.playbookPath });
      }

      const rootState = results.find((r) => r.run_id === root);
      return { status: rootState?.status ?? "UNKNOWN", runs: results };
    };

    let finalStatus: { status: string; runs: Array<{ run_id: string; status: string; playbook?: string }> } = { status: "UNKNOWN", runs: [] };

    for (let i = 0; i < maxIterations; i++) {
      iterations = i + 1;
      const runIds = collectRunIds(runId, snap);

      const allPlans: any[] = [];
      for (const id of runIds) {
        const env = await reconcileOrchestration({
          repoRoot: args.repoRoot,
          treeish: args.treeish,
          repoGit: args.repo.git,
          snap,
          nowMs: args.nowMs,
          runId: id,
          maxTransitions: 1,
          emitNonExecEvents: true,
          actor: "runner:playbook"
        });
        lastEnvelope = env;
        allPlans.push(...(env.plans ?? []));
      }

      const execOnly = allPlans.filter((p: any) => p.kind === "EXECUTE_STEP");
      if (execOnly.length > 0) {
        await execPlans({ repoRoot: args.repoRoot, plans: execOnly, nowMs: args.nowMs, actor: "hookexec-playbook" });
        snap = await loadSnapshot({ git: args.repo.git, treeish: args.treeish, inboxRefs: args.flags.inboxRefs });
        continue;
      }

      finalStatus = await deriveStatus(runId, snap);
      const st = finalStatus.status;
      if (st === "DONE" || st === "CANCELLED" || st === "WAIT_HUMAN" || st === "WAIT_DEPS") break;

      // No executable work found, treat as a no-op.
      break;
    }

    if (finalStatus.runs.length === 0) finalStatus = await deriveStatus(runId, snap);

    const status =
      finalStatus.status === "DONE" ||
      finalStatus.status === "CANCELLED" ||
      finalStatus.status === "WAIT_HUMAN" ||
      finalStatus.status === "WAIT_DEPS"
        ? finalStatus.status
        : "UNKNOWN";

    if (args.flags.json) {
      args.io.writeLine(
        args.io.out,
        JSON.stringify(
          {
            schema: "a5cforge/v1",
            kind: "run.playbook.result",
            run_id: runId,
            status,
            iterations,
            runs: finalStatus.runs.map((r) => ({ run_id: r.run_id, status: r.status, playbook: r.playbook })),
            ...(lastEnvelope ? { last_plans: lastEnvelope } : {})
          },
          null,
          2
        )
      );
    } else {
      args.io.writeLine(args.io.out, runId);
      args.io.writeLine(args.io.out, `status: ${status}`);
    }

    if (status === "DONE") return 0;
    if (status === "WAIT_DEPS") return 30;
    if (status === "WAIT_HUMAN") return 20;
    return 1;
  }

  if (sub === "sweep") {
    const max = Number.isFinite(args.flags.max) ? (args.flags.max as number) : 50;
    const res = await sweepStaleExecutions({ repoRoot: args.repoRoot, snap: args.snap, nowMs: args.nowMs, max, actor: "sweeper:cli" });
    args.io.writeLine(args.io.out, `swept: ${res.emitted}`);
    return 0;
  }

  if (sub === "resume" || sub === "complete-step") {
    const runId = args.flags.runId;
    if (!runId) {
      args.io.writeLine(args.io.err, `usage: git a5c run ${sub} --run-id <id>`);
      return 2;
    }
    const ctx = await getRunContext({ repoRoot: args.repoRoot, snap: args.snap, runId });
    if (!ctx) {
      args.io.writeLine(args.io.err, `unknown run: ${runId}`);
      return 2;
    }
    const playbookText = await fs.readFile(path.join(args.repoRoot, ctx.playbookPath), "utf8");
    const template = parseTemplate(playbookText, ctx.playbookPath);
    const state = deriveRunState({ runId, template: ctx.templatePatch ? applyTemplatePatch(template, ctx.templatePatch) : template, events: ctx.events });
    if (state.status !== "WAIT_HUMAN" || !state.waiting) {
      args.io.writeLine(args.io.err, "run is not waiting for human");
      return 2;
    }
    const written: string[] = [];
    const message = args.flags.message;
    if (sub === "complete-step") {
      written.push(
        await writeRunEvent({
          repoRoot: args.repoRoot,
          runId,
          kind: "run.human.completed_step",
          stepId: state.current.step_id,
          attempt: state.current.attempt,
          actor: "human:cli",
          nowMs: args.nowMs,
          payload: message ? { message } : {}
        })
      );
    }
    written.push(
      await writeRunEvent({
        repoRoot: args.repoRoot,
        runId,
        kind: "run.human.resumed",
        stepId: state.current.step_id,
        attempt: state.current.attempt,
        actor: "human:cli",
        nowMs: args.nowMs,
        payload: message ? { message } : {}
      })
    );
    await stageFiles(args.repoRoot, written.map((p) => path.relative(args.repoRoot, p)));
    await git(
      ["-c", "user.name=a5c", "-c", "user.email=a5c@example.invalid", "commit", "--no-gpg-sign", "-m", `a5c: ${sub} ${runId}`],
      args.repoRoot
    );
    args.io.writeLine(args.io.out, "ok");
    return 0;
  }

  // Reconcile once (for `reconcile`) or looped (for `tick`).
  const loopMax = sub === "tick" ? (args.flags.maxTransitions ?? 1) : 1;
  let snap = args.snap;
  let outObj: any;

  for (let i = 0; i < loopMax; i++) {
    outObj = await reconcileOrchestration({
      repoRoot: args.repoRoot,
      treeish: args.treeish,
      repoGit: args.repo.git,
      snap,
      nowMs: args.nowMs,
      runId: args.flags.runId,
      maxTransitions: sub === "tick" ? 1 : args.flags.maxTransitions,
      emitNonExecEvents: !args.flags.dryRun
    });

    if (sub !== "tick") break;
    if (args.flags.dryRun) break;

    const execOnly = outObj.plans.filter((p: any) => p.kind === "EXECUTE_STEP");
    if (execOnly.length === 0) {
      // If reconcile produced no executable work, treat as no-op success.
      break;
    }

    await execPlans({ repoRoot: args.repoRoot, plans: execOnly, nowMs: args.nowMs, actor: "hookexec-tick" });
    snap = await loadSnapshot({ git: args.repo.git, treeish: args.treeish, inboxRefs: args.flags.inboxRefs });
  }

  // In dry-run mode for tick, we only want to output the last reconcile result.

  // If any planned transition is blocked on deps, signal this via exit code 30.
  const blockedOnDeps = Array.isArray(outObj?.plans) && outObj.plans.some((p: any) => p.kind === "WAIT_DEPS");

  if (args.flags.json) {
    args.io.writeLine(args.io.out, JSON.stringify(outObj, null, 2));
  } else {
    args.io.writeLine(args.io.out, `plans: ${outObj.plans.length}`);
    for (const p of outObj.plans) args.io.writeLine(args.io.out, `- ${p.run_id}: ${p.kind}`);
  }
  return blockedOnDeps ? 30 : 0;
}
