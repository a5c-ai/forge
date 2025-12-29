import type { ParsedEventFile } from "../collab/eventTypes.js";
import type { Template, TemplateStep } from "./types.js";

export type RunStatus = "ACTIVE" | "WAIT_HUMAN" | "WAIT_DEPS" | "DONE" | "CANCELLED";
export type StepPhase = "IDLE" | "RUNNING" | "DONE" | "FAILED";

export type DerivedRunState = {
  run_id: string;
  status: RunStatus;
  current: { step_id: number; attempt: number; phase: StepPhase };
  resolved_template: { template_id: string; version: string };
  waiting?: { kind: "human" | "deps"; reason: string };
  deps: { pending: string[]; completed: string[] };
  reward: { latest?: { step_id: number; attempt: number; reward_total: number; signals?: any } };
  recovery?: { kind: "redo"; target_step_id: number; target_attempt: number; reason: string };
  breakpoint_overrides?: Array<{ step_id: number; attempt: number }>;
};

type StepAttemptState = {
  attempt: number;
  started: boolean;
  completed: boolean;
  failed: boolean;
  humanCompleted?: boolean;
  rewardReported?: { reward_total: number; signals?: any };
};

function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function getPayload(ev: ParsedEventFile): any {
  return (ev.event as any)?.payload ?? {};
}

export function deriveRunState(opts: { runId: string; template: Template; events: ParsedEventFile[] }): DerivedRunState {
  const stepIds = opts.template.steps.map((s) => s.step_id).sort((a, b) => a - b);
  if (stepIds.length === 0) throw new Error("template must have steps");

  const perStep: Map<number, Map<number, StepAttemptState>> = new Map();
  const ensure = (stepId: number, attempt: number) => {
    let attempts = perStep.get(stepId);
    if (!attempts) {
      attempts = new Map();
      perStep.set(stepId, attempts);
    }
    let s = attempts.get(attempt);
    if (!s) {
      s = { attempt, started: false, completed: false, failed: false };
      attempts.set(attempt, s);
    }
    return s;
  };

  let lastReward: DerivedRunState["reward"]["latest"];
  let lastWaitingEvent: { kind: "human" | "deps"; reason: string } | undefined;
  let lastProgress:
    | { kind: "run.step.started" | "run.step.completed" | "run.step.failed"; stepId: number; attempt: number }
    | { kind: "run.reward.reported"; stepId: number; attempt: number; reward_total: number }
    | undefined;

  const overrideKeys = new Set<string>();
  const setOverride = (stepId: number, attempt: number, enabled: boolean) => {
    const key = `${stepId}::${attempt}`;
    if (enabled) overrideKeys.add(key);
    else overrideKeys.delete(key);
  };

  const depPending = new Set<string>();
  const depCompleted = new Set<string>();

  for (const ev of opts.events) {
    const kind = ev.kind;
    const p = getPayload(ev);
    if (p.run_id !== opts.runId) continue;
    const stepId = asNum(p.step_id);
    const attempt = asNum(p.attempt);

    if (kind === "run.human.waiting") {
      lastWaitingEvent = { kind: "human", reason: String(p.reason ?? "breakpoint") };
      if (stepId !== undefined && attempt !== undefined) setOverride(stepId, attempt, false);
    }
    if (kind === "run.human.resumed") {
      lastWaitingEvent = undefined;
      if (stepId !== undefined && attempt !== undefined) setOverride(stepId, attempt, true);
    }
    if (kind === "run.human.completed_step" && stepId !== undefined && attempt !== undefined) {
      ensure(stepId, attempt).humanCompleted = true;
    }

    if (stepId !== undefined && attempt !== undefined) {
      const s = ensure(stepId, attempt);
      if (kind === "run.step.started") s.started = true;
      if (kind === "run.step.completed") s.completed = true;
      if (kind === "run.step.failed") s.failed = true;

      if (kind === "run.step.started" || kind === "run.step.completed" || kind === "run.step.failed") {
        lastProgress = { kind, stepId, attempt };
      }
    }

    if (kind === "run.reward.reported" && stepId !== undefined && attempt !== undefined) {
      const rewardTotal = typeof p.reward_total === "number" ? p.reward_total : typeof p.data?.reward_total === "number" ? p.data.reward_total : 0;
      const signals = p.signals ?? p.data?.signals;
      ensure(stepId, attempt).rewardReported = { reward_total: rewardTotal, signals };
      lastReward = { step_id: stepId, attempt, reward_total: rewardTotal, signals };
      lastProgress = { kind: "run.reward.reported", stepId, attempt, reward_total: rewardTotal };
    }

    if (kind === "run.dep.spawned") {
      const depRunId = p.dep_run_id;
      if (typeof depRunId === "string" && depRunId) depPending.add(depRunId);
    }
    if (kind === "run.dep.completed") {
      const depRunId = p.dep_run_id;
      if (typeof depRunId === "string" && depRunId) {
        depPending.delete(depRunId);
        depCompleted.add(depRunId);
      }
    }
  }

  const getLatestAttemptForStep = (stepId: number): number => {
    const attempts = perStep.get(stepId);
    if (!attempts) return 1;
    return Math.max(1, ...Array.from(attempts.keys()));
  };

  const isTerminal = (step: TemplateStep, stepId: number, attempt: number): boolean => {
    const attempts = perStep.get(stepId);
    const s = attempts?.get(attempt);
    if (!s) return false;
    if (step.type === "reward") return !!s.rewardReported;
    if (step.type === "human") return !!s.humanCompleted;
    return s.completed || s.failed;
  };

  const isRunning = (step: TemplateStep, stepId: number, attempt: number): boolean => {
    const attempts = perStep.get(stepId);
    const s = attempts?.get(attempt);
    if (!s) return false;
    if (step.type === "reward") return s.started && !s.rewardReported;
    return s.started && !(s.completed || s.failed);
  };

  let currentStepId = stepIds[0]!;
  let currentAttempt = 1;
  let currentPhase: StepPhase = "IDLE";
  for (const stepId of stepIds) {
    const step = opts.template.steps.find((s) => s.step_id === stepId)!;
    const a = getLatestAttemptForStep(stepId);
    if (!isTerminal(step, stepId, a)) {
      currentStepId = stepId;
      currentAttempt = a;
      currentPhase = isRunning(step, stepId, a) ? "RUNNING" : "IDLE";
      break;
    }
    // If all terminal, we'll end up on last step.
    currentStepId = stepId;
    currentAttempt = a;
    currentPhase = step.type === "reward" ? (perStep.get(stepId)?.get(a)?.rewardReported ? "DONE" : "IDLE") : "DONE";
  }

  const allDone = stepIds.every((stepId) => {
    const step = opts.template.steps.find((s) => s.step_id === stepId)!;
    const a = getLatestAttemptForStep(stepId);
    return isTerminal(step, stepId, a);
  });

  // Reward-fail recovery (MVP): if the most recent progress is a reward report
  // that fails the step's threshold, apply the policy.
  let recovery: DerivedRunState["recovery"];
  if (lastProgress?.kind === "run.reward.reported") {
    const rewardStep = opts.template.steps.find((s) => s.step_id === lastProgress.stepId);
    if (rewardStep?.type === "reward" && rewardStep.reward) {
      const pass = rewardStep.reward.thresholds.pass;
      if (lastProgress.reward_total < pass) {
        const pol = rewardStep.reward.policy;
        if (pol.on_fail === "auto_redo" && typeof pol.redo_target_step_id === "number") {
          const target = pol.redo_target_step_id;
          const nextAttempt = getLatestAttemptForStep(target) + 1;
          recovery = { kind: "redo", target_step_id: target, target_attempt: nextAttempt, reason: "reward_fail" };
          currentStepId = target;
          currentAttempt = nextAttempt;
          currentPhase = "IDLE";
        } else if (pol.on_fail === "pause") {
          lastWaitingEvent = { kind: "human", reason: "reward_fail" };
        }
      }
    }
  }

  const hasDeps = depPending.size > 0;
  const status2: RunStatus = lastWaitingEvent
    ? lastWaitingEvent.kind === "human"
      ? "WAIT_HUMAN"
      : "WAIT_DEPS"
    : hasDeps
      ? "WAIT_DEPS"
      : recovery
        ? "ACTIVE"
        : allDone
          ? "DONE"
          : "ACTIVE";

  const waiting2 = lastWaitingEvent ?? (hasDeps ? { kind: "deps" as const, reason: "deps" } : undefined);

  return {
    run_id: opts.runId,
    status: status2,
    current: { step_id: currentStepId, attempt: currentAttempt, phase: currentPhase },
    resolved_template: { template_id: opts.template.template_id, version: opts.template.version },
    waiting: waiting2,
    deps: { pending: Array.from(depPending), completed: Array.from(depCompleted) },
    reward: { latest: lastReward },
    recovery,
    breakpoint_overrides: overrideKeys.size
      ? Array.from(overrideKeys).map((s) => {
          const [step, att] = s.split("::");
          return { step_id: Number(step), attempt: Number(att) };
        })
      : undefined
  };
}
