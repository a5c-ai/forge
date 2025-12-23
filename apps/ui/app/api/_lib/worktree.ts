import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runGit } from "./gitRun";

export async function withWorktree<T>(repoRoot: string, ref: string, fn: (worktreeRoot: string) => Promise<T>): Promise<T> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-worktree-"));
  try {
    await runGit(["worktree", "add", "--force", base, ref], repoRoot);
    return await fn(base);
  } finally {
    try {
      await runGit(["worktree", "remove", "--force", base], repoRoot);
    } catch {
      // ignore cleanup errors
    }
    await fs.rm(base, { recursive: true, force: true });
  }
}

