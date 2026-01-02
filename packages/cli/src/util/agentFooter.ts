export type AgentOutputFooter = {
  schema: "a5cforge/v1";
  kind: "agent.output.footer";
  run_id: string;
  step_id: number;
  attempt: number;
  profile: string;
  status: "ok" | "needs_human" | "blocked" | "error";
  summary: string;
  changes: Array<{ path: string; op: "added" | "modified" | "deleted" | "renamed" }>;
  commands: Array<{ cmd: string; exit_code?: number }>;
  artifacts: Array<{ path: string; kind: string }>;
  events_to_write: Array<{ kind: string; payload: Record<string, unknown> }>;
  notes?: string[];
  next_steps?: string[];
};

export function extractAgentOutputFooter(markdown: string): { footer?: AgentOutputFooter; rawJson?: string; error?: string } {
  const re = /```json\s*\n([\s\S]*?)\n```\s*$/;
  const m = re.exec(markdown.trim());
  if (!m) return { error: "missing json code fence at end of output" };
  const raw = m[1] ?? "";
  try {
    const parsed = JSON.parse(raw);
    return { footer: parsed as AgentOutputFooter, rawJson: raw };
  } catch (e: any) {
    return { error: `invalid footer json: ${String(e?.message ?? e)}`, rawJson: raw };
  }
}

