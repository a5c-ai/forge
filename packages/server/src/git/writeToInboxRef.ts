import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { runGit, runGitCapture } from "./exec.js";

export async function writeToInboxRef<T>(
  repoRoot: string,
  inboxRef: string,
  fn: (worktreeDir: string) => Promise<T>
): Promise<{ result: T; commit: string }> {
  const wt = await fs.mkdtemp(path.join(os.tmpdir(), "a5cforge-inbox-"));
  const tmpBranch = `a5cforge-inbox-tmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  try {
    // Create an empty worktree (no checkout), then orphan-commit only .collab content.
    await runGit(["worktree", "add", "--detach", "--no-checkout", wt, "HEAD"], repoRoot);
    await runGit(["checkout", "--orphan", tmpBranch], wt);

    const res = await fn(wt);
    await runGit(["add", "-A"], wt);
    await runGit(["-c", "user.name=a5c-server", "-c", "user.email=a5c@example.invalid", "commit", "-m", `a5c: inbox ${inboxRef}`], wt);
    const commit = (await runGitCapture(["rev-parse", "HEAD"], wt)).trim();
    await runGit(["update-ref", inboxRef, commit], repoRoot);
    return { result: res, commit };
  } finally {
    try {
      await runGit(["worktree", "remove", "--force", wt], repoRoot);
    } catch {}
    try {
      await runGit(["branch", "-D", tmpBranch], repoRoot);
    } catch {}
    try {
      await fs.rm(wt, { recursive: true, force: true });
    } catch {}
  }
}


