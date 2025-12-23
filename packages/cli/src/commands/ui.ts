import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { CommandArgs } from "./types.js";

const require = createRequire(import.meta.url);

function hasHelpFlag(args: CommandArgs): boolean {
  return args.positionals.includes("--help") || args.positionals.includes("-h");
}

export async function handleUi(args: CommandArgs): Promise<number | undefined> {
  const cmd = args.positionals[0] ?? "help";
  if (cmd !== "ui") return;

  if (hasHelpFlag(args)) {
    args.io.writeLine(args.io.out, "git a5c ui [--port <port>]");
    args.io.writeLine(args.io.out, "");
    args.io.writeLine(args.io.out, "Environment:");
    args.io.writeLine(args.io.out, "  A5C_REPO (auto-set to current repo)");
    args.io.writeLine(args.io.out, "  A5C_TREEISH (defaults to --treeish or HEAD)");
    args.io.writeLine(args.io.out, "  A5C_INBOX_REFS (from --inbox-ref)");
    return 0;
  }

  process.env.A5C_REPO = args.repoRoot;
  process.env.A5C_TREEISH = args.treeish ?? "HEAD";
  const defaultInboxRef = "refs/a5c/inbox/ui";
  const inboxRefs = args.flags.inboxRefs?.length ? args.flags.inboxRefs : undefined;
  process.env.A5C_INBOX_REFS = inboxRefs?.join(",") ?? process.env.A5C_INBOX_REFS ?? defaultInboxRef;

  const uiPkgJson = fileURLToPath(import.meta.resolve("@a5c-ai/ui/package.json"));
  const uiDir = path.dirname(uiPkgJson);
  const nextBin = require.resolve("next/dist/bin/next", { paths: [uiDir] });

  if (Number.isFinite(args.flags.port)) {
    process.env.PORT = String(args.flags.port);
  }

  const child = spawn(process.execPath, [nextBin, "start"], {
    cwd: uiDir,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1" }
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
  return exitCode;
}
