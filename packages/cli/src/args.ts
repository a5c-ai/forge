export type ParsedArgs = {
  flags: {
    repo?: string;
    treeish?: string;
    json?: boolean;
    inboxRefs?: string[];
    sync?: boolean;
    port?: number;
    token?: string;
    since?: string;
    limit?: number;
    types?: string[];
    entity?: string;
    active?: boolean;
    stageOnly?: boolean;
    commit?: boolean;
    message?: string;
    title?: string;
    body?: string;
    id?: string;
    commentId?: string;
    reason?: string;
    base?: string;
    head?: string;
    headRef?: string;
    topic?: string;
    by?: string;
    op?: string;
    agentId?: string;
    ttlSeconds?: number;
    task?: string;
    env?: string;
    rev?: string;
    artifact?: string;
    dispatchId?: string;
    url?: string;
    type?: string;
    plan?: string;
    playbook?: string;
    overridesFile?: string;
    runId?: string;
    max?: number;
    maxTransitions?: number;
    dryRun?: boolean;
    in?: string;
    out?: string;
    stdout?: string;
    stderr?: string;
    profile?: string;
    model?: string;
    mcps?: string;
    config?: string;
    template?: string;
    vars?: Record<string, string>;
    pretty?: boolean;
    maxIterations?: number;
  };
  positionals: string[];
};

export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const flags: ParsedArgs["flags"] = {};
  const positionals: string[] = [];

  while (args.length) {
    const a = args.shift()!;
    if (a === "--repo") flags.repo = args.shift()!;
    else if (a === "--treeish") flags.treeish = args.shift()!;
    else if (a === "--json") flags.json = true;
    else if (a === "--sync") flags.sync = true;
    else if (a === "--port" || a === "-p") flags.port = Number(args.shift()!);
    else if (a === "--token") flags.token = args.shift()!;
    else if (a === "--inbox-ref") {
      const v = args.shift()!;
      flags.inboxRefs ??= [];
      flags.inboxRefs.push(v);
    } else if (a === "--since") flags.since = args.shift()!;
    else if (a === "--limit") flags.limit = Number(args.shift()!);
    else if (a === "--types") flags.types = args.shift()!.split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--entity") flags.entity = args.shift()!;
    else if (a === "--active") flags.active = true;
    else if (a === "--stage-only") flags.stageOnly = true;
    else if (a === "--commit") flags.commit = true;
    else if (a === "--message" || a === "-m") flags.message = args.shift()!;
    else if (a === "--title") flags.title = args.shift()!;
    else if (a === "--body") flags.body = args.shift()!;
    else if (a === "--id") flags.id = args.shift()!;
    else if (a === "--comment-id") flags.commentId = args.shift()!;
    else if (a === "--reason") flags.reason = args.shift()!;
    else if (a === "--base") flags.base = args.shift()!;
    else if (a === "--head") flags.head = args.shift()!;
    else if (a === "--head-ref") flags.headRef = args.shift()!;
    else if (a === "--topic") flags.topic = args.shift()!;
    else if (a === "--by") flags.by = args.shift()!;
    else if (a === "--op") flags.op = args.shift()!;
    else if (a === "--agent-id") flags.agentId = args.shift()!;
    else if (a === "--ttl-seconds") flags.ttlSeconds = Number(args.shift()!);
    else if (a === "--task") flags.task = args.shift()!;
    else if (a === "--env") flags.env = args.shift()!;
    else if (a === "--rev") flags.rev = args.shift()!;
    else if (a === "--artifact") flags.artifact = args.shift()!;
    else if (a === "--dispatch-id") flags.dispatchId = args.shift()!;
    else if (a === "--url") flags.url = args.shift()!;
    else if (a === "--type") flags.type = args.shift()!;
    else if (a === "--plan") flags.plan = args.shift()!;
    else if (a === "--playbook") flags.playbook = args.shift()!;
    else if (a === "--overrides-file") flags.overridesFile = args.shift()!;
    else if (a === "--run-id") flags.runId = args.shift()!;
    else if (a === "--max") flags.max = Number(args.shift()!);
    else if (a === "--max-transitions") flags.maxTransitions = Number(args.shift()!);
    else if (a === "--max-iterations") flags.maxIterations = Number(args.shift()!);
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--in") flags.in = args.shift()!;
    else if (a === "--out") flags.out = args.shift()!;
    else if (a === "--stdout") flags.stdout = args.shift()!;
    else if (a === "--stderr") flags.stderr = args.shift()!;
    else if (a === "--profile") flags.profile = args.shift()!;
    else if (a === "--model") flags.model = args.shift()!;
    else if (a === "--mcps") flags.mcps = args.shift()!;
    else if (a === "--config") flags.config = args.shift()!;
    else if (a === "--pretty") flags.pretty = true;
    else if (a === "--template") flags.template = args.shift()!;
    else if (a === "--var") {
      const v = args.shift()!;
      const idx = v.indexOf("=");
      const k = idx >= 0 ? v.slice(0, idx) : v;
      const val = idx >= 0 ? v.slice(idx + 1) : "true";
      flags.vars ??= {};
      if (k) flags.vars[k] = val;
    }
    else positionals.push(a);
  }

  return { flags, positionals };
}


