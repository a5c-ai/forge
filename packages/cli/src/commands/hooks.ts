import type { CommandArgs } from "./types.js";
import path from "node:path";
import fs from "node:fs/promises";
import { gitPath } from "../git.js";

export async function handleHooks(args: CommandArgs): Promise<number | undefined> {
  if (args.positionals[0] !== "hooks") return;
  const sub = args.positionals[1];
  if (sub !== "install" && sub !== "uninstall") {
    args.io.writeLine(args.io.err, "usage: git a5c hooks install|uninstall");
    return 2;
  }
  const hooksDirRaw = await gitPath(args.repoRoot, "hooks");
  const hooksDir = path.isAbsolute(hooksDirRaw) ? hooksDirRaw : path.join(args.repoRoot, hooksDirRaw);
  const hookFiles = ["post-commit", "post-merge"];
  if (sub === "uninstall") {
    for (const f of hookFiles) {
      try {
        const p = `${hooksDir}/${f}`;
        const cur = await fs.readFile(p, "utf8");
        if (cur.includes("A5C-HOOK-MANAGED: yes")) {
          await fs.unlink(p);
        }
      } catch {}
    }
    args.io.writeLine(args.io.out, "ok");
    return 0;
  }
  const script = `#!/bin/sh\n# a5cforge hook (generated)\n# A5C-HOOK-MANAGED: yes\n# Keep it quiet; write last journal to .git\nif command -v git >/dev/null 2>&1; then\n  git a5c journal --since 2h --limit 20 --json > "$(git rev-parse --git-path a5c-last-journal.json)" 2>/dev/null || true\nfi\nexit 0\n`;
  await fs.mkdir(hooksDir, { recursive: true });
  for (const f of hookFiles) {
    const p = `${hooksDir}/${f}`;
    await fs.writeFile(p, script, "utf8");
    try {
      await fs.chmod(p, 0o755);
    } catch {}
  }
  args.io.writeLine(args.io.out, "ok");
  return 0;
}


