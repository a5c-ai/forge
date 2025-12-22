import { createA5cServer } from "@a5c-ai/server";
import type { CommandArgs } from "./types.js";

function hasHelpFlag(args: CommandArgs): boolean {
  return args.positionals.includes("--help") || args.positionals.includes("-h");
}

export async function handleServer(args: CommandArgs): Promise<number | undefined> {
  const cmd = args.positionals[0] ?? "help";
  if (cmd !== "server") return;

  if (hasHelpFlag(args)) {
    args.io.writeLine(args.io.out, "git a5c server [--repo <path>] [--port <port>] [--token <token>]");
    args.io.writeLine(args.io.out, "");
    args.io.writeLine(args.io.out, "Environment (alternatives):");
    args.io.writeLine(args.io.out, "  A5C_SERVER_REPO or A5C_REPO");
    args.io.writeLine(args.io.out, "  A5C_SERVER_TOKEN or A5C_REMOTE_TOKEN");
    args.io.writeLine(args.io.out, "  PORT (default: 3939)");
    return 0;
  }

  process.env.A5C_SERVER_REPO = args.repoRoot;
  if (args.flags.token) process.env.A5C_SERVER_TOKEN = args.flags.token;

  const port = Number.isFinite(args.flags.port) ? (args.flags.port as number) : Number(process.env.PORT ?? "3939");
  const actualPort = Number.isFinite(port) ? port : 3939;

  const srv = createA5cServer();
  const actual = await srv.listen(actualPort);
  args.io.writeLine(args.io.out, `a5c-server listening on :${actual}`);

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });

  await srv.close();
  return 0;
}

