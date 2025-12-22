import type { CommandArgs } from "./types.js";

export function handleHelp(args: CommandArgs): number | undefined {
  const cmd = args.positionals[0] ?? "help";
  if (cmd !== "help" && cmd !== "--help" && cmd !== "-h") return;

  const { writeLine } = args.io;
  const out = args.io.out;
  writeLine(out, "git a5c <command> [--json] [--treeish <ref>] [--repo <path>] [--inbox-ref <ref>...]");
  writeLine(out, "");
  writeLine(out, "Commands:");
  writeLine(out, "  status");
  writeLine(out, "  issue list");
  writeLine(out, "  issue show <id>");
  writeLine(out, "  issue new --title <t> [--body <b>] [--stage-only|--commit]");
  writeLine(out, "  issue comment <id> -m <text> [--comment-id <id>] [--stage-only|--commit]");
  writeLine(out, "  issue edit-comment <commentId> --id <issueId> -m <text> [--stage-only|--commit]");
  writeLine(out, "  issue redact-comment <commentId> --id <issueId> [--reason <r>] [--stage-only|--commit]");
  writeLine(out, "  pr list");
  writeLine(out, "  pr show <prKey>");
  writeLine(out, "  pr propose --base <ref> --head <ref> --title <t> [--body <b>] [--stage-only|--commit]");
  writeLine(out, "  pr request --base <ref> --title <t> [--body <b>] [--stage-only|--commit]");
  writeLine(out, "  pr claim <prKey> --head-ref <ref> [-m <msg>] [--stage-only|--commit]");
  writeLine(out, "  pr bind-head <prKey> --head-ref <ref> [-m <msg>] [--stage-only|--commit]");
  writeLine(out, "  block <entityId> --by <issue|pr> [--op add|remove] [-m <note>] [--stage-only|--commit]");
  writeLine(out, "  gate needs-human <entityId> [--topic <t>] [-m <msg>] [--stage-only|--commit]");
  writeLine(out, "  gate clear <entityId> [-m <msg>] [--stage-only|--commit]");
  writeLine(out, "  agent heartbeat [--agent-id <id>] [--ttl-seconds N] [--entity <id>] [-m <status>] [--stage-only|--commit]");
  writeLine(out, "  ops deploy --entity <id> [--artifact <uri>] [-m <status>] [--stage-only|--commit]");
  writeLine(out, "  verify");
  writeLine(out, "  journal [--since <2h|2025-...>] [--limit N] [--types a,b] [--entity <id>] [--active]");
  writeLine(out, "  server [--port <port>] [--token <token>]");
  writeLine(out, "  ui [--port <port>]");
  writeLine(out, "  hooks install|uninstall");
  writeLine(out, "  webhook status");
  writeLine(out, "  webhook test --url <url> [--type <type>]");
  return 0;
}
