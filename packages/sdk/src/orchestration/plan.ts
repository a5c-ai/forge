import type { Template, TemplateStep } from "./types.js";
import type { DerivedRunState } from "./derive.js";
import { evalExprBoolean } from "./expr.js";

export type PlannedTransition =
  | {
      kind: "WAIT_HUMAN";
      reason: string;
      events_to_emit: Array<{ kind: string; payload: Record<string, unknown> }>;
    }
  | {
      kind: "WAIT_DEPS";
      reason: string;
      deps: { pending: string[]; completed: string[] };
      events_to_emit: Array<{ kind: string; payload: Record<string, unknown> }>;
    }
  | {
      kind: "EXECUTE_STEP";
      step_id: number;
      attempt: number;
      step_type: string;
      hook_input: Record<string, unknown>;
      events_to_emit_before: Array<{ kind: string; payload: Record<string, unknown> }>;
      events_expected_after: string[];
    };

function effectiveBreakpoint(opts: { step: TemplateStep; state: DerivedRunState; template: Template }): { enabled: boolean; reason?: string } {
  const overridden = (opts.state.breakpoint_overrides ?? []).some(
    (o) => o.step_id === opts.step.step_id && o.attempt === opts.state.current.attempt
  );
  if (overridden) return { enabled: false };
  if (opts.step.breakpoint?.enabled) return { enabled: true, reason: "breakpoint" };
  for (const rule of opts.template.cbp ?? []) {
    if (rule.scope !== "step") continue;
    if (rule.step_id !== opts.step.step_id) continue;
    try {
      if (evalExprBoolean(rule.when, { state: opts.state })) return { enabled: true, reason: rule.id };
    } catch {
      // Fail-closed; reconcile can optionally surface warning events.
    }
  }
  return { enabled: false };
}

export function planNextTransition(opts: {
  state: DerivedRunState;
  template: Template;
  resolveStepHook: (step: TemplateStep) => string;
}): PlannedTransition | undefined {
  if (opts.state.status === "WAIT_HUMAN") return undefined;
  if (opts.state.status === "WAIT_DEPS") {
    return {
      kind: "WAIT_DEPS",
      reason: opts.state.waiting?.reason ?? "deps",
      deps: { pending: opts.state.deps.pending, completed: opts.state.deps.completed },
      events_to_emit: []
    };
  }
  if (opts.state.status === "DONE" || opts.state.status === "CANCELLED") return undefined;

  const step = opts.template.steps.find((s) => s.step_id === opts.state.current.step_id);
  if (!step) throw new Error(`unknown step_id: ${opts.state.current.step_id}`);

  const bp = effectiveBreakpoint({ step, state: opts.state, template: opts.template });
  if (step.type === "human" || bp.enabled) {
    return {
      kind: "WAIT_HUMAN",
      reason: step.type === "human" ? "human" : bp.reason ?? "breakpoint",
      events_to_emit: [
        {
          kind: "run.human.waiting",
          payload: { run_id: opts.state.run_id, step_id: step.step_id, attempt: opts.state.current.attempt, reason: bp.reason ?? "breakpoint" }
        }
      ]
    };
  }

  const hook = opts.resolveStepHook(step);
  if (!hook) throw new Error(`no hook resolved for step ${step.step_id} (${step.type})`);

  const redoEvent =
    opts.state.recovery?.kind === "redo" && opts.state.recovery.target_step_id === step.step_id
      ? [
          {
            kind: "run.step.redo_requested",
            payload: {
              run_id: opts.state.run_id,
              target_step_id: opts.state.recovery.target_step_id,
              target_attempt: opts.state.recovery.target_attempt,
              reason: opts.state.recovery.reason
            }
          }
        ]
      : [];

  return {
    kind: "EXECUTE_STEP",
    step_id: step.step_id,
    attempt: opts.state.current.attempt,
    step_type: step.type,
    hook_input: {
      run_id: opts.state.run_id,
      step_id: step.step_id,
      attempt: opts.state.current.attempt,
      instructions: step.instructions ?? "",
      agent: step.type === "agent" ? (step.agent ?? {}) : undefined,
      state: opts.state,
      template: opts.template
    },
    events_to_emit_before: [
      ...redoEvent,
      {
        kind: "run.step.started",
        payload: { run_id: opts.state.run_id, step_id: step.step_id, attempt: opts.state.current.attempt }
      }
    ],
    events_expected_after: step.type === "reward" ? ["run.reward.reported"] : ["run.step.completed", "run.step.failed"]
  };
}
