import { detectRepoRoot } from "./git.js";
import { parseArgs } from "./args.js";
import { createLogger, loadSnapshot, openRepo, parseLogLevel } from "@a5c-ai/sdk";
import type { CommandArgs } from "./commands/types.js";
import { handleHelp } from "./commands/help.js";
import { handleWebhook } from "./commands/webhook.js";
import { handleStatus } from "./commands/status.js";
import { handleIssue } from "./commands/issue.js";
import { handlePr } from "./commands/pr.js";
import { handleBlock } from "./commands/block.js";
import { handleGate } from "./commands/gate.js";
import { handleAgent } from "./commands/agent.js";
import { handleOps } from "./commands/ops.js";
import { handleHooks } from "./commands/hooks.js";
import { handleVerify } from "./commands/verify.js";
import { handleJournal } from "./commands/journal.js";

export type RunOptions = {
  cwd?: string;
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
};

function writeLine(write: (s: string) => void, s = "") {
  write(s + "\n");
}

function nowMs(): number {
  // Test hook for deterministic journal/active: set A5C_NOW_ISO=...
  const iso = process.env.A5C_NOW_ISO;
  if (iso) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

export async function runCli(argv: string[], opts: RunOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const out = opts.stdout ?? ((s) => process.stdout.write(s));
  const err = opts.stderr ?? ((s) => process.stderr.write(s));
  const log = createLogger({ base: { component: "cli" }, level: parseLogLevel(process.env.A5C_LOG_LEVEL ?? "silent") });

  const { flags, positionals } = parseArgs(argv);
  const cmd = positionals[0] ?? "help";

  let repoRoot: string;
  try {
    repoRoot = typeof flags.repo === "string" ? flags.repo : await detectRepoRoot(cwd);
  } catch {
    writeLine(err, "not a git repository (use --repo <path>)");
    return 2;
  }
  const treeish = typeof flags.treeish === "string" ? flags.treeish : "HEAD";

  log.debug("start", { cmd, treeish, repoRoot });
  const repo = await openRepo(repoRoot);
  const snap = await loadSnapshot({ git: repo.git, treeish, inboxRefs: flags.inboxRefs });

  const baseArgs: CommandArgs = {
    repoRoot,
    treeish,
    flags,
    positionals,
    repo,
    snap,
    nowMs,
    io: { out, err, writeLine }
  };

  const handlers: Array<() => number | undefined | Promise<number | undefined>> = [
    () => handleHelp(baseArgs),
    () => handleWebhook(baseArgs),
    () => handleStatus(baseArgs),
    () => handleIssue(baseArgs),
    () => handlePr(baseArgs),
    () => handleBlock(baseArgs),
    () => handleGate(baseArgs),
    () => handleAgent(baseArgs),
    () => handleOps(baseArgs),
    () => handleHooks(baseArgs),
    () => handleVerify(baseArgs),
    () => handleJournal(baseArgs)
  ];

  for (const h of handlers) {
    const r = await h();
    if (r !== undefined) {
      log.debug("done", { code: r });
      return r;
    }
  }

  writeLine(err, `unknown command: ${cmd}`);
  log.warn("unknown_command", { cmd });
  return 2;
}


