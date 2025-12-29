export type StepType = "agent" | "human" | "reward";

export type BreakpointConfig = {
  enabled?: boolean;
};

export type AgentConfig = {
  // Option B (requested): allow playbooks to select an agent profile.
  // Hook resolution is handled by repo-level mapping; this profile is metadata.
  profile?: string;
};

export type RewardPolicy = {
  on_fail: "auto_redo" | "pause" | "fail";
  redo_target_step_id?: number;
};

export type RewardConfig = {
  signals: string[];
  policy: RewardPolicy;
  thresholds: {
    pass: number;
  };
};

export type TemplateStep = {
  step_id: number;
  name?: string;
  type: StepType;
  instructions?: string;
  breakpoint?: BreakpointConfig;
  agent?: AgentConfig;
  reward?: RewardConfig;
  dependencies?: {
    allow_spawn?: boolean;
    await?: "all";
  };
};

export type SignalScoring =
  | { mode: "pass_fail" }
  | { mode: "diff_ratio"; pass_if_lte: number };

export type SignalConfig = {
  severity: "HARD" | "SOFT";
  weight: number;
  producer: string;
  producer_args?: Record<string, unknown>;
  scoring: SignalScoring;
};

export type EvidenceProducerConfig = {
  kind: "command";
  default_outputs?: string[];
};

export type CbpRule = {
  id: string;
  scope: "step";
  step_id: number;
  when: string;
  message?: string;
};

export type Template = {
  template_id: string;
  version: string;
  name?: string;
  description?: string;
  steps: TemplateStep[];
  signals?: Record<string, SignalConfig>;
  evidence_producers?: Record<string, EvidenceProducerConfig>;
  breakpoints?: {
    overrides?: {
      allow?: boolean;
    };
  };
  cbp?: CbpRule[];
};
