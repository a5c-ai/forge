import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandArgs } from "./types.js";

function hasHelpFlag(args: CommandArgs): boolean {
  return args.positionals.includes("--help") || args.positionals.includes("-h");
}

function findStandaloneServerJs(uiDir: string): string | undefined {
  const candidates = [
    path.join(uiDir, ".next", "standalone", "server.js"),
    path.join(uiDir, ".next", "standalone", "apps", "ui", "server.js")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  const standaloneDir = path.join(uiDir, ".next", "standalone");
  if (!fs.existsSync(standaloneDir)) return undefined;

  const stack = [standaloneDir];
  while (stack.length) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        stack.push(path.join(dir, e.name));
      } else if (e.isFile() && e.name === "server.js") {
        return path.join(dir, e.name);
      }
    }
  }
  return undefined;
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
  if (args.flags.inboxRefs?.length) {
    process.env.A5C_INBOX_REFS = args.flags.inboxRefs.join(",");
  }

  const uiPkgJson = fileURLToPath(import.meta.resolve("@a5c-ai/ui/package.json"));
  const uiDir = path.dirname(uiPkgJson);
  const serverJs = findStandaloneServerJs(uiDir);
  if (!serverJs) {
    args.io.writeLine(
      args.io.err,
      "UI build not found. Reinstall after a release that publishes prebuilt UI assets (Next standalone output)."
    );
    return 1;
  }

  if (Number.isFinite(args.flags.port)) {
    process.env.PORT = String(args.flags.port);
  }

  const child = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1" }
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
  return exitCode;
}
