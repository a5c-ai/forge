import type { SignalConfig, Template, TemplateStep } from "./types.js";

export type EvidenceObject = {
  evidence_id: string;
  kind: "report" | "diff" | "log" | "artifact" | "metric";
  paths?: string[];
  summary?: string;
  metrics?: Record<string, unknown>;
  mime?: string;
};

export type RewardReport = {
  reward_total: number;
  pass_threshold: number;
  decision: "pass" | "redo" | "escalate_bp";
  signals: Record<
    string,
    {
      pass_fail: boolean;
      score: number;
      severity: "HARD" | "SOFT";
      evidence: EvidenceObject[];
      summary?: string;
    }
  >;
  notes?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function metricsNum(ev: EvidenceObject, key: string): number | undefined {
  const v = ev.metrics?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function scoreSignal(opts: { signalId: string; config: SignalConfig; evidence: EvidenceObject[] }): {
  pass_fail: boolean;
  score: number;
  summary?: string;
} {
  const scoring = opts.config.scoring;

  if (scoring.mode === "pass_fail") {
    // MVP heuristic:
    // - If any evidence carries `metrics.failed > 0`, it's a failure.
    // - Otherwise, treat as pass.
    const failed = opts.evidence.some((e) => {
      const n = metricsNum(e, "failed");
      return typeof n === "number" && n > 0;
    });
    return { pass_fail: !failed, score: failed ? 0 : 1 };
  }

  if (scoring.mode === "diff_ratio") {
    const ratios = opts.evidence
      .map((e) => metricsNum(e, "diff_ratio"))
      .filter((n): n is number => typeof n === "number");
    const ratio = ratios.length ? Math.min(...ratios) : undefined;
    if (ratio === undefined) return { pass_fail: false, score: 0, summary: "missing diff_ratio" };

    const pass = ratio <= scoring.pass_if_lte;
    if (pass) return { pass_fail: true, score: 1 };

    // Linear falloff from threshold→1.0.
    const denom = 1 - scoring.pass_if_lte;
    const score = denom > 0 ? 1 - (ratio - scoring.pass_if_lte) / denom : 0;
    return { pass_fail: false, score: clamp01(score), summary: `diff_ratio=${ratio}` };
  }

  return { pass_fail: false, score: 0, summary: "unsupported scoring mode" };
}

export function computeRewardReportFromEvidence(opts: {
  template: Template;
  step: TemplateStep;
  evidenceBySignal: Record<string, EvidenceObject[]>;
}): RewardReport {
  if (opts.step.type !== "reward" || !opts.step.reward) throw new Error("computeRewardReportFromEvidence requires reward step");

  const passThreshold = opts.step.reward.thresholds.pass;
  const signalReports: RewardReport["signals"] = {};

  let weightSum = 0;
  let weightedScoreSum = 0;

  for (const signalId of opts.step.reward.signals) {
    const cfg = opts.template.signals?.[signalId];
    const evidence = opts.evidenceBySignal[signalId] ?? [];
    if (!cfg) {
      signalReports[signalId] = { pass_fail: false, score: 0, severity: "HARD", evidence, summary: "missing signal config" };
      continue;
    }
    const scored = scoreSignal({ signalId, config: cfg, evidence });
    signalReports[signalId] = { ...scored, severity: cfg.severity, evidence };
    weightSum += cfg.weight;
    weightedScoreSum += cfg.weight * scored.score;
  }

  const rewardTotal = weightSum > 0 ? clamp01(weightedScoreSum / weightSum) : 0;
  const decision: RewardReport["decision"] =
    rewardTotal >= passThreshold ? "pass" : opts.step.reward.policy.on_fail === "auto_redo" ? "redo" : "escalate_bp";

  return {
    reward_total: rewardTotal,
    pass_threshold: passThreshold,
    decision,
    signals: signalReports
  };
}

